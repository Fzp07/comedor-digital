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

  let body: {
    employee_code?: string;
    meal_type?: string;
    supervisor_email?: string;
    supervisor_pin?: string;
    reason?: string;
    device_token?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Solicitud inválida" });
  }

  const code = (body.employee_code ?? "").trim();
  const mealType = body.meal_type === "merienda" ? "merienda" : "almuerzo";
  const email = (body.supervisor_email ?? "").trim();
  const pin = (body.supervisor_pin ?? "").trim();
  const reason = (body.reason ?? "").trim();

  if (!code) return json({ ok: false, message: "Ingresa el código del empleado." });
  if (!email || !pin) return json({ ok: false, message: "Ingresa el correo y PIN del supervisor." });
  if (reason.length < 10) return json({ ok: false, message: "Describe el motivo de la excepción (mínimo 10 caracteres)." });

  const { data: allowed } = await admin.rpc("check_rate_limit", {
    p_key: `override:${operator.id}`,
    p_limit: 10,
    p_window_seconds: 300,
  });
  if (allowed === false) return json({ ok: false, message: "Demasiadas solicitudes de excepción. Espera unos minutos." }, 429);

  const { data: supervisor, error: supervisorError } = await admin.rpc("verify_supervisor_pin", {
    p_email: email,
    p_pin: pin,
  });
  if (supervisorError) return json({ ok: false, message: supervisorError.message }, 500);

  const authorized = supervisor as { ok: boolean; message?: string; profile_id?: string; role?: string; site_id?: string; full_name?: string };
  if (!authorized.ok || !authorized.profile_id) {
    await admin.from("security_events").insert({
      event_type: "override_pin_fallido",
      severity: "warning",
      user_id: operator.id,
      site_id: operator.site_id,
      details: { message: "Intento de excepción con PIN de supervisor inválido", supervisor_email: email },
    });
    return json({ ok: false, message: authorized.message ?? "No fue posible autorizar la excepción." });
  }

  if (operator.role !== "admin" && authorized.site_id !== operator.site_id) {
    return json({ ok: false, message: "El supervisor autorizante pertenece a otra sede." });
  }

  const { data: employee } = await admin
    .from("employees")
    .select("id, full_name, code, site_id, status, photo_url, position")
    .or(`code.eq.${code},document_number.eq.${code}`)
    .maybeSingle();

  if (!employee) return json({ ok: false, message: "Empleado no encontrado." });
  if (employee.status !== "activo") return json({ ok: false, message: "El empleado no está activo." });
  if (employee.site_id !== operator.site_id && operator.role !== "admin") {
    return json({ ok: false, message: "El empleado pertenece a otra sede." });
  }

  const device = await resolveDevice(admin, body.device_token, employee.site_id);
  if (device.error) {
    await admin.from("security_events").insert({
      event_type: "dispositivo_no_autorizado",
      severity: "warning",
      user_id: operator.id,
      site_id: employee.site_id,
      details: { message: device.error, employee_code: code },
    });
    return json({ ok: false, message: device.error });
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [{ data: settings }, { count: todayCount }] = await Promise.all([
    admin.from("company_settings").select("max_overrides_per_day").eq("id", true).single(),
    admin.from("overrides").select("id", { count: "exact", head: true }).eq("site_id", employee.site_id).gte("created_at", `${today}T05:00:00.000Z`),
  ]);

  const limit = settings?.max_overrides_per_day ?? 3;
  if ((todayCount ?? 0) >= limit && operator.role !== "admin") {
    return json({
      ok: false,
      message: `Se alcanzó el límite de ${limit} excepciones autorizadas hoy en esta sede. Un administrador puede autorizar una adicional.`,
    });
  }

  const idempotencyKey = `override:${employee.id}:${today}:${mealType}`;
  const { data: result, error: redeemError } = await admin.rpc("redeem_ticket", {
    p_employee_id: employee.id,
    p_operator_id: operator.id,
    p_site_id: employee.site_id,
    p_meal_type: mealType,
    p_ticket_id: null,
    p_method: "manual",
    p_device_id: device.id,
    p_idempotency_key: idempotencyKey,
    p_offline: false,
    p_override_reason: reason,
    p_override_authorized_by: authorized.profile_id,
    p_ip: ip,
    p_user_agent: userAgent,
  });

  if (redeemError) {
    return json({ ok: false, message: redeemError.message.replace(/^.*?:\s*/, "") });
  }

  await admin.from("security_events").insert({
    event_type: "override_autorizado",
    severity: "warning",
    user_id: authorized.profile_id,
    employee_id: employee.id,
    site_id: employee.site_id,
    details: {
      message: "Excepción autorizada por supervisor",
      reason,
      requested_by: operator.full_name,
      supervisor: authorized.full_name,
      meal_type: mealType,
    },
  });

  return json(result);
});
