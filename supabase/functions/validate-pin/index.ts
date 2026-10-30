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

  let body: { employee_code?: string; pin?: string; meal_type?: string; device_token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Solicitud inválida" });
  }

  const code = (body.employee_code ?? "").trim();
  const pin = (body.pin ?? "").trim();
  const mealType = body.meal_type === "merienda" ? "merienda" : "almuerzo";

  if (!code || !/^\d{4,6}$/.test(pin)) {
    return json({ ok: false, message: "Ingresa el código del empleado y un PIN de 4 a 6 dígitos." });
  }

  const { data: allowed } = await admin.rpc("check_rate_limit", {
    p_key: `pin:${operator.id}:${code.toLowerCase()}`,
    p_limit: 8,
    p_window_seconds: 300,
  });
  if (allowed === false) {
    await admin.from("security_events").insert({
      event_type: "rate_limit_pin",
      severity: "warning",
      user_id: operator.id,
      site_id: operator.site_id,
      details: { message: "Demasiados intentos de PIN", employee_code: code },
    });
    return json({ ok: false, message: "Demasiados intentos con este código. Espera 5 minutos." }, 429);
  }

  const { data: verification, error: verifyError } = await admin.rpc("verify_employee_pin", {
    p_employee_code: code,
    p_pin: pin,
  });
  if (verifyError) return json({ ok: false, message: verifyError.message }, 500);

  const verified = verification as { ok: boolean; message?: string; employee_id?: string; site_id?: string; full_name?: string; photo_url?: string | null };
  if (!verified.ok || !verified.employee_id) {
    await admin.from("security_events").insert({
      event_type: "pin_fallido",
      severity: "warning",
      user_id: operator.id,
      site_id: operator.site_id,
      details: { message: "PIN incorrecto", employee_code: code },
    });
    return json({ ok: false, message: verified.message ?? "PIN incorrecto." });
  }

  if (operator.role !== "admin" && operator.site_id !== verified.site_id) {
    return json({ ok: false, message: "El empleado pertenece a otra sede." });
  }

  const siteId = operator.role === "admin" ? verified.site_id : operator.site_id;
  const device = await resolveDevice(admin, body.device_token, siteId);
  if (device.error) {
    await admin.from("security_events").insert({
      event_type: "dispositivo_no_autorizado",
      severity: "warning",
      user_id: operator.id,
      site_id: siteId,
      details: { message: device.error, employee_code: code },
    });
    return json({ ok: false, message: device.error });
  }

  const idempotencyKey = `pin:${verified.employee_id}:${new Date().toISOString().slice(0, 10)}:${mealType}`;

  const { data: result, error: redeemError } = await admin.rpc("redeem_ticket", {
    p_employee_id: verified.employee_id,
    p_operator_id: operator.id,
    p_site_id: siteId,
    p_meal_type: mealType,
    p_ticket_id: null,
    p_method: "pin",
    p_device_id: device.id,
    p_idempotency_key: idempotencyKey,
    p_offline: false,
    p_override_reason: null,
    p_override_authorized_by: null,
    p_ip: ip,
    p_user_agent: userAgent,
  });

  if (redeemError) {
    return json({ ok: false, message: redeemError.message.replace(/^.*?:\s*/, "") });
  }

  return json(result);
});
