# Migraciones

Estos archivos son incrementales sobre el esquema base del piloto. El esquema inicial se aprovisionó directamente en Supabase; las migraciones `013`–`017` documentan y reproducen el endurecimiento aplicado el 2026-10-30.

Orden de aplicación:

1. `013_isolate_credentials_private_photos.sql`
2. `014_fk_indexes.sql`
3. `015_rls_initplan.sql`
4. `016_retention_cron.sql`
5. `017_privileges_mfa_flag.sql`
6. `018_mfa_rls_enforcement.sql`
7. `019_mfa_settings_profiles_policies.sql`

Antes de aplicar en un entorno nuevo:

- Tener el esquema base y las funciones `current_app_role()`, `can_manage_people()`, `can_read_site()`, `is_admin()` y `redeem_ticket()`.
- Confirmar que `pgcrypto` está disponible en el esquema `extensions`.
- Ejecutar en una rama o proyecto de ensayo, no directamente en producción.
- Verificar después: `verify_employee_pin`, `verify_supervisor_pin`, políticas del bucket `employee-photos`, job `purge-operational-data`, `company_settings.require_mfa` y la función `public.mfa_ok()`.
- Con `require_mfa = true`, probar que un rol privilegiado en AAL1 no puede leer `employees` ni modificar `company_settings`; el propio perfil y la lectura de `company_settings` deben seguir disponibles para poder redirigir al reto MFA.
