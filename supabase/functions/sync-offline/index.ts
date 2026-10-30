import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveDevice } from "../_shared/device.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

interface QrPayload {
  v: number;
  e: string;
  s: string;
  m: "almuerzo" | "merienda";
  n: string;
  exp: number;
  iat: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authorization = req.headers.get("Authorization") ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, message: "Sesión inválida" }, 401);

  const { data: operator } = await admin
    .from("profiles")
    .select("id, role, site_id, active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!operator?.active || !["admin", "operador", "supervisor"].includes(operator.role)) {
    return json({ ok: false, message: "Tu rol no está autorizado para sincronizar consumos." }, 403);
  }

  let body: { items?: Array<{ token?: string; idempotency_key?: string; meal_type?: string }>; device_token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Solicitud inválida" });
  }

  const items = (body.items ?? []).slice(0, 100);
  if (items.length === 0) return json({ ok: true, synced: 0, failed: 0, results: [] });

  const { data: settings } = await admin
    .from("company_settings")
    .select("allow_offline, offline_grace_minutes")
    .eq("id", true)
    .single();

  if (!settings?.allow_offline) {
    return json({ ok: false, message: "El modo offline está deshabilitado por el administrador." }, 403);
  }
  const graceSeconds = (settings.offline_grace_minutes ?? 10) * 60;

  const { data: secret } = await admin.rpc("get_signing_secret");
  if (!secret) return json({ ok: false, message: "Configuración de firma ausente." }, 500);

  await admin.from("sync_batches").insert({
    operator_id: operator.id,
    status: "procesando",
    item_count: items.length,
  });

  const results: Array<Record<string, unknown>> = [];
  const deviceCache = new Map<string, { id: string | null; error?: string }>();

  for (const item of items) {
    const token = (item.token ?? "").trim();
    const idempotencyKey = (item.idempotency_key ?? "").trim();
    if (!token.includes(".") || !idempotencyKey) {
      results.push({ idempotency_key: idempotencyKey, ok: false, message: "Elemento de sincronización inválido." });
      continue;
    }

    const [rawPayload, providedSignature] = token.split(".");
    if (!rawPayload || !providedSignature) {
      results.push({ idempotency_key: idempotencyKey, ok: false, message: "Token offline inválido." });
      continue;
    }

    const expectedSignature = await hmac(rawPayload, secret);
    if (!safeEqual(expectedSignature, providedSignature)) {
      results.push({ idempotency_key: idempotencyKey, ok: false, message: "Firma del token offline inválida." });
      continue;
    }

    let payload: QrPayload;
    try {
      payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(rawPayload))) as QrPayload;
    } catch {
      results.push({ idempotency_key: idempotencyKey, ok: false, message: "Token offline corrupto." });
      continue;
    }

    if (operator.role !== "admin" && operator.site_id !== payload.s) {
      results.push({ idempotency_key: idempotencyKey, ok: false, message: "El token pertenece a otra sede." });
      continue;
    }

    if (!deviceCache.has(payload.s)) {
      deviceCache.set(payload.s, await resolveDevice(admin, body.device_token, payload.s));
    }
    const device = deviceCache.get(payload.s);
    if (device?.error) {
      results.push({ idempotency_key: idempotencyKey, ok: false, message: device.error });
      continue;
    }

    if (Date.now() / 1000 > payload.exp + graceSeconds) {
      results.push({
        idempotency_key: idempotencyKey,
        ok: false,
        message: `El token offline superó la ventana de gracia de ${settings.offline_grace_minutes ?? 10} minutos.`,
      });
      continue;
    }

    const { data: nonceOwner } = await admin.rpc("consume_qr_nonce", {
      p_nonce: payload.n,
      p_operator_id: operator.id,
    });
    if (!nonceOwner) {
      results.push({ idempotency_key: idempotencyKey, ok: false, duplicate: true, message: "El consumo ya había sido sincronizado." });
      continue;
    }

    const { data: result, error: redeemError } = await admin.rpc("redeem_ticket", {
      p_employee_id: payload.e,
      p_operator_id: operator.id,
      p_site_id: payload.s,
      p_meal_type: payload.m,
      p_ticket_id: null,
      p_method: "qr",
      p_device_id: device?.id ?? null,
      p_idempotency_key: idempotencyKey,
      p_offline: true,
      p_override_reason: null,
      p_override_authorized_by: null,
      p_ip: ip,
      p_user_agent: userAgent,
    });

    if (redeemError) {
      results.push({ idempotency_key: idempotencyKey, ok: false, message: redeemError.message.replace(/^.*?:\s*/, "") });
      continue;
    }

    results.push({ idempotency_key: idempotencyKey, ok: true, result });
  }

  const synced = results.filter((item) => item.ok === true).length;
  const failed = results.length - synced;

  await admin.from("security_events").insert({
    event_type: "sincronizacion_offline",
    severity: failed > 0 ? "warning" : "info",
    user_id: operator.id,
    site_id: operator.site_id,
    details: { message: `${synced} consumos sincronizados, ${failed} con error`, total: items.length },
  });

  return json({ ok: true, synced, failed, results });
});
