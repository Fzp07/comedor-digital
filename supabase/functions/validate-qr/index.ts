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

async function logEvent(admin: ReturnType<typeof createClient>, input: {
  type: string;
  severity: "info" | "warning" | "critical";
  userId?: string;
  employeeId?: string | null;
  siteId?: string | null;
  details: Record<string, unknown>;
}) {
  try {
    await admin.from("security_events").insert({
      event_type: input.type,
      severity: input.severity,
      user_id: input.userId ?? null,
      employee_id: input.employeeId ?? null,
      site_id: input.siteId ?? null,
      details: input.details,
    });
  } catch {
    // el registro de seguridad no debe romper la validación
  }
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
    .select("id, role, site_id, active, full_name")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!operator?.active || !["admin", "operador", "supervisor"].includes(operator.role)) {
    return json({ ok: false, message: "Tu rol no está autorizado para validar consumos." }, 403);
  }

  let body: { token?: string; device_token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Solicitud inválida" });
  }
  const token = (body.token ?? "").trim();
  if (!token.includes(".")) return json({ ok: false, message: "Código QR inválido." });

  const { data: allowed } = await admin.rpc("check_rate_limit", {
    p_key: `qr:${operator.id}`,
    p_limit: 90,
    p_window_seconds: 60,
  });
  if (allowed === false) {
    await logEvent(admin, {
      type: "rate_limit_validacion",
      severity: "warning",
      userId: operator.id,
      siteId: operator.site_id,
      details: { message: "Demasiados intentos de validación QR en un minuto" },
    });
    return json({ ok: false, message: "Demasiados intentos. Espera un minuto e intenta de nuevo." }, 429);
  }

  const [rawPayload, providedSignature] = token.split(".");
  if (!rawPayload || !providedSignature) return json({ ok: false, message: "Código QR inválido." });

  const { data: secret } = await admin.rpc("get_signing_secret");
  if (!secret) return json({ ok: false, message: "Configuración de firma ausente." }, 500);

  const expectedSignature = await hmac(rawPayload, secret);
  if (!safeEqual(expectedSignature, providedSignature)) {
    await logEvent(admin, {
      type: "qr_firma_invalida",
      severity: "critical",
      userId: operator.id,
      siteId: operator.site_id,
      details: { message: "Intento de validación con QR manipulado o de otro entorno" },
    });
    return json({ ok: false, message: "El QR no es válido. Solicita al empleado generar uno nuevo." });
  }

  let payload: QrPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(rawPayload))) as QrPayload;
  } catch {
    return json({ ok: false, message: "El contenido del QR está corrupto." });
  }

  if (payload.v !== 1 || !payload.e || !payload.n || !payload.m) {
    return json({ ok: false, message: "Versión de QR no soportada." });
  }

  if (Date.now() / 1000 > payload.exp + 5) {
    await logEvent(admin, {
      type: "qr_vencido",
      severity: "info",
      userId: operator.id,
      employeeId: payload.e,
      siteId: payload.s,
      details: { message: "QR presentado después de su expiración", exp: payload.exp },
    });
    return json({ ok: false, message: "El QR expiró. Pide al empleado que lo actualice y vuelve a escanear." });
  }

  if (operator.role !== "admin" && operator.site_id !== payload.s) {
    return json({ ok: false, message: "El empleado pertenece a otra sede. Solicita apoyo del supervisor." });
  }

  const device = await resolveDevice(admin, body.device_token, payload.s);
  if (device.error) {
    await logEvent(admin, {
      type: "dispositivo_no_autorizado",
      severity: "warning",
      userId: operator.id,
      employeeId: payload.e,
      siteId: payload.s,
      details: { message: device.error },
    });
    return json({ ok: false, message: device.error });
  }

  const { data: nonceOwner, error: nonceError } = await admin.rpc("consume_qr_nonce", {
    p_nonce: payload.n,
    p_operator_id: operator.id,
  });
  if (nonceError) return json({ ok: false, message: nonceError.message }, 500);
  if (!nonceOwner) {
    await logEvent(admin, {
      type: "qr_reutilizado",
      severity: "critical",
      userId: operator.id,
      employeeId: payload.e,
      siteId: payload.s,
      details: { message: "Intento de reutilizar un nonce de QR ya consumido" },
    });
    return json({ ok: false, duplicate: true, message: "Este QR ya fue utilizado. Genera uno nuevo." });
  }

  const idempotencyKey = `qr:${payload.n}`;
  const { data: result, error: redeemError } = await admin.rpc("redeem_ticket", {
    p_employee_id: payload.e,
    p_operator_id: operator.id,
    p_site_id: payload.s,
    p_meal_type: payload.m,
    p_ticket_id: null,
    p_method: "qr",
    p_device_id: device.id,
    p_idempotency_key: idempotencyKey,
    p_offline: false,
    p_override_reason: null,
    p_override_authorized_by: null,
    p_ip: ip,
    p_user_agent: userAgent,
  });

  if (redeemError) {
    await logEvent(admin, {
      type: "validacion_rechazada",
      severity: "warning",
      userId: operator.id,
      employeeId: payload.e,
      siteId: payload.s,
      details: { message: redeemError.message },
    });
    return json({ ok: false, message: redeemError.message.replace(/^.*?:\s*/, "") });
  }

  return json(result);
});
