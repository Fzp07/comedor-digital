import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface DeviceResolution {
  id: string | null;
  error?: string;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Resuelve la caja que está validando el consumo.
 *
 * - Si `company_settings.require_device` es true, el token es obligatorio.
 * - Si el token existe, debe corresponder a un dispositivo activo de la misma sede.
 * - Si la política no exige dispositivo y no hay token, se permite la validación
 *   y se registra `device_id = null` para no romper el piloto.
 */
export async function resolveDevice(
  admin: SupabaseClient,
  deviceToken: string | undefined,
  siteId: string,
): Promise<DeviceResolution> {
  const { data: settings } = await admin
    .from("company_settings")
    .select("require_device")
    .eq("id", true)
    .maybeSingle();

  const required = Boolean(settings?.require_device);
  const token = (deviceToken ?? "").trim();

  if (!token) {
    return required
      ? { id: null, error: "Esta caja no está autorizada. Registra el dispositivo y configura su token." }
      : { id: null };
  }

  const tokenHash = await sha256Hex(token);
  const { data: device } = await admin
    .from("devices")
    .select("id, site_id, status")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!device || device.status !== "activo") {
    return { id: null, error: "El dispositivo no está autorizado o fue revocado." };
  }

  if (device.site_id !== siteId) {
    return { id: null, error: "El dispositivo pertenece a otra sede." };
  }

  await admin
    .from("devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);

  return { id: device.id };
}
