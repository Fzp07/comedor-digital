# Comedor Digital

PWA móvil-first para administrar el comedor de **una sola empresa**: empleados, planes y cupos, tiquetes digitales, validación de QR/PIN, historial, reportes y auditoría. Construida con Next.js App Router, Supabase y Netlify.

> **Estado:** MVP funcional desplegado en producción con datos demo. Single-tenant: una empresa, una o varias sedes.

## URLs

| Servicio | URL |
| --- | --- |
| Aplicación (Netlify) | https://comedor-digital.netlify.app |
| Supabase (API) | https://urkwubgdifcesfozdbbe.supabase.co |
| Repositorio GitHub | [Fzp07/comedor-digital](https://github.com/Fzp07/comedor-digital) (privado) |

## Cuentas demo

Todas usan la contraseña **`Demo2026*`**.

| Rol | Correo | Nombre | Alcance |
| --- | --- | --- | --- |
| Administrador | `admin@comedordigital.co` | Mariana Salazar | Control total, configuración, seguridad y auditoría |
| RR.HH. | `rrhh@comedordigital.co` | Nicolás Rueda | Empleados, planes, emisión de tiquetes |
| Operador | `operador@comedordigital.co` | Pedro Cáceres | Validación QR, PIN y modo offline |
| Supervisor | `supervisor@comedordigital.co` | Claudia Benítez | Excepciones, anulaciones, reportes |
| Auditor | `auditor@comedordigital.co` | Hernán Quintero | Solo lectura, auditoría y exportaciones |
| Empleado | `empleado@comedordigital.co` | Ana María Torres (`EMP-001`) | QR dinámico, tiquetes e historial |

- **PIN de empleado demo:** `1234` (empleados `EMP-001` a `EMP-010`).
- **PIN de supervisor para excepciones:** `5678`.
- El empleado demo está vinculado a `EMP-001` y a la Sede Central.

## Funcionalidad

### Operación
- **Validación QR dinámico** firmado con HMAC-SHA256, TTL de 45 segundos y nonce de un solo uso.
- **Validación por PIN** como método de respaldo.
- **Excepción de supervisor** con correo + PIN, motivo obligatorio y auditoría.
- **Modo offline** en el operador: cola cifrada en IndexedDB, sincronización idempotente y ventana de gracia configurable.
- **Cámara del dispositivo** para escanear QR y entrada manual del token.
- **Un consumo por empleado, comida y fecha**, controlado además por el cupo del plan.

### Gestión
- CRUD de empleados con foto, sede, centro de costo, estado, consentimientos y credencial biométrica.
- Importación CSV con detección de duplicados por código, documento y correo.
- Planes de alimentación y cupos por empleado, con vigencias.
- Emisión individual y por lote de tiquetes, con detección de duplicados.
- Anulación y reemisión con motivo, rol supervisor/administrador y auditoría.
- Configuración de empresa, sedes, ventanas de servicio, centros de costo, menús y políticas.

### Analítica y control
- Panel en tiempo real: consumos, tiquetes, excepciones y ocupación por sede.
- Historial inmutable con filtros, exportación CSV y eventos de compensación.
- Reportes por sede/comida, centro de costo, plan, estado de tiquetes, excepciones y conciliación de cocina.
- Exportación CSV, impresión/PDF y configuración de reporte programado.
- Centro de seguridad: eventos, auditoría append-only, dispositivos autorizados y MFA TOTP.

### Seguridad y privacidad
- RLS deny-by-default en todas las tablas expuestas; roles con mínimo privilegio.
- Funciones sensibles `SECURITY DEFINER` restringidas al service role.
- Service role solo dentro de Edge Functions; nunca en el navegador.
- Dispositivos con token opaco, hash SHA-256 en servidor y revocación inmediata.
- MFA TOTP para cuentas privilegiadas (UI y flag `mfa_enrolled`).
- Consentimiento informado, minimización de datos y aviso de privacidad alineado con Ley 1581 de Colombia.
- Cabeceras CSP, HSTS, `X-Frame-Options`, `nosniff` y `Referrer-Policy`.
- Auditoría inmutable de cambios y eventos de seguridad.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, componentes estilo shadcn, PWA.
- **Backend:** Supabase Postgres, Auth, Edge Functions (Deno), RLS, Storage, Realtime, Vault.
- **Offline:** Dexie + IndexedDB + Web Crypto.
- **QR:** `qrcode` en cliente; firma y validación en Edge Functions.
- **Calidad:** ESLint, Vitest, `tsc` dentro de `next build`.
- **Infraestructura:** Netlify (frontend), GitHub Actions (CI), Supabase (datos y funciones).

## Arquitectura

```text
Navegador (PWA Next.js)
  ├── Supabase Auth (JWT, MFA TOTP)
  ├── Postgres + RLS (lecturas y mutaciones permitidas por rol)
  ├── Edge Functions (service role)
  │     ├── qr-token        → emite QR firmado + nonce
  │     ├── validate-qr     → valida HMAC, TTL, nonce y cupo
  │     ├── validate-pin    → respaldo por PIN
  │     ├── validate-override → excepción autorizada por supervisor
  │     └── sync-offline    → sincronización idempotente
  └── IndexedDB (Dexie)     → cola offline cifrada
```

Flujo QR:

1. El empleado abre **Mi QR**; la PWA llama `qr-token`.
2. La Edge Function valida sesión, plan y ventana; crea un nonce y firma `{v,e,s,m,n,exp,iat}` con HMAC-SHA256.
3. El operador escanea `base64url(payload).base64url(firma)`.
4. `validate-qr` verifica firma, expiración, nonce, estado del empleado, ventana, cupo y duplicados.
5. `redeem_ticket` registra el consumo de forma atómica y consume el nonce.
6. Un segundo intento con el mismo token/nonce se rechaza y genera evento de seguridad.

## Estructura del repositorio

```text
src/
  app/
    login/                 Inicio de sesión y cuentas demo
    app/                   Área autenticada
      dashboard/           Panel general
      empleados/           Gestión e importación
      planes/              Planes y cupos
      tiquetes/            Emisión, anulación y lote
      operador/            Validación QR/PIN/offline
      mi-qr/               QR dinámico del empleado
      historial/           Historial y compensaciones
      reportes/            Analítica y exportaciones
      configuracion/       Ajustes de empresa y operación
      seguridad/           Eventos, auditoría, dispositivos, MFA
    privacidad/            Aviso de privacidad
    offline/               Página de respaldo offline
  components/              UI, shell, gráficos, logo
  lib/                     Supabase, tipos, utils, CSV, Dexie, cripto
  providers/               Auth y toasts
supabase/functions/        Edge Functions Deno
docs/                      Arquitectura, seguridad, operación y demo
```

## Desarrollo local

Requisitos: Node.js 22+, npm.

```bash
npm install
cp .env.example .env.local
# Completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Abre http://localhost:3000.

Variables de entorno:

| Variable | Dónde vive | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Netlify / `.env.local` | URL pública de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Netlify / `.env.local` | Clave publicable (segura para el navegador) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo Edge Functions | Nunca en el frontend ni en el repo |
| `QR_HMAC_SECRET` | Supabase Vault / `app_secrets` | Firma de QR; rotación controlada |

> No escribas tokens, claves `service_role` ni secretos en el repositorio ni en `opencode.json`.

## Base de datos

Migraciones aplicadas en el proyecto `urkwubgdifcesfozdbbe`:

1. `001_core_schema` — tablas, enums, índices y triggers.
2. `002_helpers_dashboard_tickets` — helpers de rol, dashboard y emisión.
3. `003_redeem_security_views` — canje atómico, nonces, eventos y vistas.
4. `004_rls_policies` — políticas RLS por rol.
5. `005_seed_demo_v2` — datos demo (empresa, sedes, empleados, planes).
6. `006_overrides_rate_kitchen` — excepciones, rate limiting y conciliación.
7. `007_employee_photos_bucket` — bucket y políticas de fotos.
8. `008_mfa_flag` — flag `mfa_enrolled` y RPC de actualización.
9. `009_fix_pgcrypto_search_path` — `search_path = public, extensions` para pgcrypto.
10. `010_lock_service_functions` — revoca `EXECUTE` de funciones sensibles a `anon`/`authenticated`; solo `service_role`.
11. `011_harden_trigger_functions` — `search_path` fijo y sin RPC para funciones de trigger.
12. `012_demo_reset` — reinicio de consumos demo para la presentación (solo datos del piloto).

El esquema productivo es la fuente de verdad y está registrado en `supabase_migrations.schema_migrations`. Para replicar en un entorno nuevo, usa `supabase db pull`/`db push` con las credenciales del proyecto o vuelve a aplicar las migraciones desde el historial de Supabase.

Objetos relevantes:

- RPCs de negocio: `issue_ticket_batch`, `cancel_ticket`, `redeem_ticket`, `resolve_security_event`, `register_device`, `revoke_device`, `set_my_mfa_enrolled`.
- RPCs solo service role: `verify_employee_pin`, `verify_supervisor_pin`, `get_signing_secret`, `create_qr_nonce`, `consume_qr_nonce`, `check_rate_limit`.
- Vistas de reportes: `v_daily_summary`, `v_employee_directory`, `v_redemption_detail`, `v_cost_center_summary`, `v_ticket_summary`, `v_exceptions`, `v_kitchen_summary`.
- Secreto de firma: `public.app_secrets` (`qr_hmac_secret`), accesible solo por `get_signing_secret()`.

## Edge Functions

```bash
# Instala la CLI de Supabase y autentica
npm i -g supabase
supabase login
supabase link --project-ref urkwubgdifcesfozdbbe

# Despliega todas las funciones
supabase functions deploy qr-token
supabase functions deploy validate-qr
supabase functions deploy validate-pin
supabase functions deploy validate-override
supabase functions deploy sync-offline
```

Todas usan `verify_jwt: true`, crean su propio cliente con service role y devuelven errores de negocio como HTTP 200 con `{ ok: false }` para que la PWA pueda mostrar el motivo real.

## Despliegue en Netlify

- Sitio: `comedor-digital` (`34d6ca31-d742-4cce-b42c-30b92f91b187`).
- Build: `npm run build`, publish `.next`, plugin `@netlify/plugin-nextjs`.
- Variables configuradas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Para conectar el repositorio: Netlify → Site configuration → Build & deploy → Link repository, o `npx netlify deploy --prod` desde la raíz.

## Calidad

```bash
npm run lint    # 0 errores; advertencias intencionales de carga de datos en efectos
npm test        # Vitest: CSV, utilidades, fechas y roles
npm run build   # TypeScript + build de producción
```

Pruebas de extremo a extremo ejecutadas contra Supabase:

- Login de empleado, operador, supervisor y admin.
- Emisión y validación de QR de almuerzo.
- Rechazo de reutilización del mismo QR.
- PIN correcto e incorrecto.
- Excepción de supervisor válida e inválida.
- Sincronización offline y rechazo de duplicado offline.
- Emisión por lote y detección de tiquete duplicado.
- Registro y revocación de dispositivo.

## Seguridad y privacidad

Resumen; el detalle está en [docs/SEGURIDAD.md](docs/SEGURIDAD.md).

- RLS activo y deny-by-default; roles `admin`, `rrhh`, `operador`, `supervisor`, `auditor`, `empleado`.
- Funciones sensibles (`get_signing_secret`, `verify_*_pin`, `redeem_ticket`, nonces y rate limit) solo service role; el navegador nunca ve la service role key ni puede invocarlas por RPC.
- QR firmado, TTL corto, nonce de un solo uso y auditoría de duplicados.
- Dispositivos autorizados con token opaco y hash en servidor.
- MFA TOTP disponible para todas las cuentas; obligatorio para admin/supervisor antes de producción.
- Datos personales minimizados; consentimiento y aviso de privacidad (Ley 1581 de 2012).
- Backups/PITR, rotación de secretos y pentest externo son requisitos de producción.

## Limitaciones conocidas

- **MFA:** la UI está implementada, pero ningún usuario demo tiene un factor TOTP enrolado todavía.
- **Reporte programado:** la configuración se persiste, pero el envío automático por correo requiere configurar `pg_cron` y un proveedor SMTP/API en producción.
- **WebAuthn:** el modelo y las políticas existen; el enrolamiento biométrico completo (SimpleWebAuthn) queda como siguiente iteración. El PIN y el QR cubren el MVP.
- **Migraciones locales:** el esquema se aplicó vía Supabase MCP; el historial está en Supabase, no como archivos SQL en el repo.
- **Render:** no se usa; el MCP devolvió `unauthorized` y el MVP no lo requiere.

## Documentación

- [Arquitectura](docs/ARQUITECTURA.md)
- [Seguridad y cumplimiento](docs/SEGURIDAD.md)
- [Manual de operación](docs/OPERACION.md)
- [Guion de demo](docs/DEMO.md)
