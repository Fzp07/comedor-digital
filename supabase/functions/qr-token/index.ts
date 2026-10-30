import { createClient } from "npm:@supabase/supabase-js@2";

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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function bogotaNow(): { date: string; time: string; dow: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
    dow: weekdays[get("weekday")] ?? 1,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authorization = req.headers.get("Authorization") ?? "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, message: "Sesión inválida" }, 401);

  let body: { meal_type?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let employee: Database["public"]["Tables"]["employees"] | null = null;

  // Primero intenta ligar por user_id (flujo normal con sesión auth)
  let { data: empById } = await admin
    .from("employees")
    .select("id, code, full_name, photo_url, site_id, status, user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (empById) {
    employee = empById;
  } else {
    // Fallback: busca por correo electrónico (útil en demo/seed sin user_id ligado)
    const { data: empByEmail } = await admin
      .from("employees")
      .select("id, code, full_name, photo_url, site_id, status, user_id, email")
      .eq("email", userData.user.email ?? "")
      .maybeSingle();
    employee = empByEmail as any;
  }

  if (!employee) return json({ ok: false, message: "Tu usuario no está vinculado a un empleado. Contacta a RR.HH." });
  if (employee.status !== "activo") return json({ ok: false, message: "Tu registro de empleado no está activo." });

  const { data: settings } = await admin
    .from("company_settings")
    .select("qr_ttl_seconds, allow_offline")
    .eq("id", true)
    .single();
  const ttl = Math.min(60, Math.max(30, settings?.qr_ttl_seconds ?? 45));
  const now = bogotaNow();

  const { data: plans } = await admin
    .from("employee_plans")
    .select("plan_id, start_date, end_date, active, meal_plans(id,name,meal_type,days_allowed,meals_per_day,active,valid_from,valid_to)")
    .eq("employee_id", employee.id)
    .eq("active", true);

  const available = (plans ?? [])
    .map((row) => row.meal_plans as unknown as {
      id: string; name: string; meal_type: string; days_allowed: number[]; meals_per_day: number;
      active: boolean; valid_from: string | null; valid_to: string | null;
    } | null)
    .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan && plan.active))
    .filter((plan) => !plan.valid_from || plan.valid_from <= now.date)
    .filter((plan) => !plan.valid_to || plan.valid_to >= now.date)
    .filter((plan) => plan.days_allowed?.includes(now.dow));

  if (available.length === 0) {
    return json({ ok: false, message: "No tienes un plan de alimentación vigente para hoy." });
  }

  const requested = body.meal_type as "almuerzo" | "merienda" | undefined;
  const meal = requested && available.some((plan) => plan.meal_type === requested) ? requested : available[0].meal_type;

  const { data: windows } = await admin
    .from("service_windows")
    .select("id,name,start_time,end_time,days_allowed,meal_type")
    .eq("site_id", employee.site_id)
    .eq("meal_type", meal)
    .eq("active", true);

  const window = (windows ?? []).find((row) => row.days_allowed?.includes(now.dow));
  if (!window) return json({ ok: false, message: `Hoy no hay servicio de ${meal} en tu sede.` });

  if (now.time < window.start_time || now.time > window.end_time) {
    return json({
      ok: false,
      message: `El servicio de ${meal} está disponible de ${window.start_time.slice(0, 5)} a ${window.end_time.slice(0, 5)}.`,
      window: { start: window.start_time, end: window.end_time },
    });
  }

  const { data: consumed } = await admin
    .from("redemptions")
    .select("id, redeemed_at")
    .eq("employee_id", employee.id)
    .eq("redemption_date", now.date)
    .eq("meal_type", meal)
    .eq("status", "valido")
    .maybeSingle();

  if (consumed) {
    return json({
      ok: false,
      consumed: true,
      message: `Ya registraste ${meal} hoy a las ${new Date(consumed.redeemed_at).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}.`,
    });
  }

  const { data: secret } = await admin.rpc("get_signing_secret");
  if (!secret) return json({ ok: false, message: "El secreto de firma no está configurado." }, 500);

  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const { error: nonceError } = await admin.rpc("create_qr_nonce", {
    p_employee_id: employee.id,
    p_nonce: nonce,
    p_expires: expiresAt.toISOString(),
  });
  if (nonceError) return json({ ok: false, message: nonceError.message }, 500);

  const payloadObject = {
    v: 1,
    e: employee.id,
    s: employee.site_id,
    m: meal,
    n: nonce,
    exp: Math.floor(expiresAt.getTime() / 1000),
    iat: Math.floor(Date.now() / 1000),
  };
  const rawPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payloadObject)));
  const signature = await sign(rawPayload, secret);
  const token = `${rawPayload}.${signature}`;

  const [{ data: site }, { data: costCenter }] = await Promise.all([
    admin.from("sites").select("name").eq("id", employee.site_id).maybeSingle(),
    admin
      .from("employees")
      .select("cost_centers(name)")
      .eq("id", employee.id)
      .maybeSingle(),
  ]);

  const plan = available.find((item) => item.meal_type === meal) ?? available[0];

  return json({
    ok: true,
    token,
    expires_at: expiresAt.toISOString(),
    ttl_seconds: ttl,
    meal_type: meal,
    plan: { name: plan.name, meals_per_day: plan.meals_per_day },
    allow_offline: Boolean(settings?.allow_offline),
    employee: {
      id: employee.id,
      full_name: employee.full_name,
      code: employee.code,
      photo_url: employee.photo_url,
      site_name: site?.name ?? "",
      cost_center: (costCenter as { cost_centers?: { name?: string } } | null)?.cost_centers?.name ?? null,
    },
  });
});
