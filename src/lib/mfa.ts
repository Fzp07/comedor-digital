import type { AppRole, Profile } from "@/lib/types";

/** Roles con acceso a datos personales o funciones administrativas. */
export const MFA_ENFORCED_ROLES: AppRole[] = ["admin", "rrhh", "supervisor", "auditor"];

/**
 * Determina si la sesión actual debe pasar por el reto de segundo factor.
 * La política solo aplica cuando `company_settings.require_mfa` está activo.
 */
export function mfaChallengeRequired(
  profile: Profile | null,
  mfaEnabled: boolean,
  currentLevel: string | null,
): boolean {
  return Boolean(
    mfaEnabled &&
      profile?.active &&
      MFA_ENFORCED_ROLES.includes(profile.role) &&
      currentLevel !== "aal2",
  );
}
