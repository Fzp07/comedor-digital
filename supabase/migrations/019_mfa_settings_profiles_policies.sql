-- 019: cerrar los dos policies que permitían saltarse el AAL2.
-- - settings_admin_update podía desactivar require_mfa en AAL1.
-- - profiles_admin_all permitía leer/gestionar todos los perfiles en AAL1.

alter policy settings_admin_update on public.company_settings
using (public.mfa_ok() and public.is_admin())
with check (public.mfa_ok() and public.is_admin());

alter policy profiles_admin_all on public.profiles
using (public.mfa_ok() and public.is_admin())
with check (public.mfa_ok() and public.is_admin());
