# Arquitectura — Comedor Digital

## Principios

1. **Single-tenant:** una empresa, una o varias sedes. No hay registro de empresas ni facturación SaaS.
2. **Mínimo privilegio:** cada rol ve y modifica solo lo necesario; RLS deny-by-default.
3. **Servidor confiable:** la firma de QR, el canje y los secretos viven en Postgres/Edge Functions, nunca en el navegador.
4. **Trazabilidad:** consumos, anulaciones, excepciones, dispositivos y cambios administrativos quedan auditados.
5. **Operación real:** el comedor no puede detenerse por falta de internet; el operador tiene cola offline idempotente.

## Vista de despliegue

```text
┌─────────────────────────────┐
│ Netlify                     │
│ Next.js 16 PWA (estático +  │
│ server runtime de Netlify)  │
└──────────────┬──────────────┘
               │ HTTPS
┌──────────────▼──────────────┐
│ Supabase                    │
│  ├── Auth (JWT, TOTP)       │
│  ├── Postgres + RLS         │
│  ├── Edge Functions (Deno)  │
│  ├── Storage (fotos)        │
│  ├── Realtime               │
│  └── Vault / app_secrets    │
└─────────────────────────────┘
```

No hay servidor propio ni Render. El frontend es una PWA; las funciones privilegiadas se ejecutan en Supabase.

## Modelo de datos

### Configuración y catálogos
- `company_settings` — singleton (`id = true`): nombre, NIT, zona horaria, moneda, TTL de QR, offline, overrides, reportes.
- `sites` — sedes/cafeterías.
- `cost_centers` — centros de costo por sede.
- `meal_plans` — planes (almuerzo, merienda, desayuno) con cupo y precio.
- `employee_plans` — asignación de plan a empleado con vigencia.
- `service_windows` — ventanas por sede y comida (`start_time`, `end_time`, días).
- `menus` — menús por fecha/comida/sede.

### Personas y acceso
- `employees` — datos laborales, sede, centro de costo, estado, foto, PIN hash, consentimientos.
- `profiles` — usuario de Auth vinculado a rol y sede; `mfa_enrolled`.
- `permissions`, `role_permissions` — catálogo de permisos por rol.
- `consents` — consentimientos informados (datos y biometría).
- `biometric_credentials` — credenciales WebAuthn revocables (sin imágenes ni plantillas).
- `sessions` — sesiones/dispositivos lógicos.
- `api_keys` — llaves de integración (si se habilitan).

### Tiquetes y consumos
- `ticket_batches` — lote de emisión.
- `tickets` — tiquete único por empleado/comida/fecha, estado y vigencia.
- `ticket_events` — historial de cambios de estado.
- `redemptions` — consumo validado (QR, PIN, manual u offline).
- `qr_nonces` — nonces de un solo uso con expiración.
- `overrides` — excepciones autorizadas por supervisor.
- `sync_batches` — lotes de sincronización offline.

### Seguridad y control
- `devices` — cajas autorizadas con token hash y estado.
- `device_events` — registro/revocación/actividad.
- `security_events` — duplicados, fuera de horario, PIN fallido, offline, etc.
- `audit_log` — cambios administrativos append-only.
- `rate_limits` — contadores por clave/ventana.
- `app_secrets` — secreto HMAC y otros secretos; acceso solo por RPC service role.
- `backup_runs`, `data_retention_policies`, `report_exports` — gobierno de datos.

### Vistas de lectura
- `v_daily_summary` — consumos por día/sede/comida.
- `v_employee_directory` — directorio con plan y sede.
- `v_redemption_detail` — detalle de consumos.
- `v_cost_center_summary` — consumo por centro de costo.
- `v_ticket_summary` — estado de tiquetes.
- `v_exceptions` — excepciones y fraudes.
- `v_kitchen_summary` — conciliación de cocina.

## Roles y permisos

| Capacidad | admin | rrhh | supervisor | operador | auditor | empleado |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Configurar empresa/sedes | ✅ | — | — | — | — | — |
| Gestionar empleados y planes | ✅ | ✅ | — | — | solo lectura | — |
| Emitir tiquetes | ✅ | ✅ | — | — | — | — |
| Anular/reemitir | ✅ | — | ✅ | — | — | — |
| Validar QR/PIN | ✅ | — | ✅ | ✅ | — | — |
| Excepción de supervisor | ✅ | — | ✅ | — | — | — |
| Ver historial | ✅ | ✅ | ✅ | ✅ | ✅ | propio |
| Reportes | ✅ | ✅ | ✅ | — | ✅ | — |
| Seguridad/auditoría | ✅ | — | — | — | ✅ | — |
| Dispositivos | ✅ | — | — | — | — | — |
| MFA propio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

La UI aplica `RoleGate`, pero la autorización real está en RLS y en las RPC. Ocultar un botón no es un control de seguridad.

## Flujos críticos

### 1. Emisión de QR dinámico

```text
Empleado → qr-token (Edge Function)
  ├── verifica JWT
  ├── valida empleado activo, plan, cupo y ventana
  ├── crea nonce en qr_nonces (TTL 45 s)
  └── firma payload {v,e,s,m,n,exp,iat} con HMAC-SHA256
        ↓
  token = base64url(payload).base64url(firma)
```

- `e` empleado, `s` sede, `m` comida, `n` nonce, `exp` expiración, `iat` emisión.
- El secreto se obtiene con `get_signing_secret()` (service role).
- El token es opaco para el cliente y no se puede reutilizar.

### 2. Validación y canje

```text
Operador → validate-qr
  ├── verifica firma y TTL
  ├── verifica dispositivo autorizado (si la política lo exige)
  ├── verifica nonce no consumido
  ├── verifica ventana, plan, cupo y duplicados
  └── redeem_ticket() atómico
        ├── bloquea/valida tiquete
        ├── inserta redemption
        ├── marca ticket usado y consume nonce
        └── registra auditoría/evento
```

Un segundo intento con el mismo token devuelve `ticket_duplicado` y crea un evento de seguridad crítico.

### 3. PIN

`validate-pin` verifica el PIN con `crypt()` contra `employees.pin_hash` (pgcrypto en `extensions`) y aplica las mismas reglas de plan/ventana/duplicado. Es el respaldo cuando el empleado no puede generar QR.

### 4. Excepción de supervisor

`validate-override` exige correo y PIN de un supervisor activo, motivo de mínimo 10 caracteres, y registra `overrides` + `redemptions` con `method = manual`. El PIN se verifica en servidor y nunca se almacena en claro.

### 5. Offline

- El operador cifra la cola en IndexedDB (Dexie + Web Crypto).
- Cada item lleva `idempotency_key`.
- `sync-offline` procesa el lote, inserta `sync_batches` y usa la clave para no duplicar consumos.
- Si el servidor rechaza un item (duplicado, vencido, fuera de ventana), devuelve el motivo y el operador lo muestra.
- La ventana de gracia se configura en `company_settings.offline_grace_minutes`.

## Edge Functions

| Función | Responsabilidad | Entradas | Salidas |
| --- | --- | --- | --- |
| `qr-token` | Emite QR firmado | `meal_type` | `token`, `expires_at`, `plan`, `employee` |
| `validate-qr` | Valida y canjea QR | `token`, opcional `device_token` | `ok`, `plan`, `employee`, `redemption_id` |
| `validate-pin` | Valida y canjea por PIN | `employee_code`, `pin`, `meal_type` | igual que QR |
| `validate-override` | Excepción con supervisor | `employee_code`, `meal_type`, `supervisor_email`, `supervisor_pin`, `reason` | igual que QR + `override` |
| `sync-offline` | Sincroniza cola | `items[]` con `token`, `idempotency_key`, `meal_type` | resultados por item |

Todas:

- `verify_jwt: true`.
- Crean cliente con `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` desde el entorno de la función.
- Devuelven errores de negocio como HTTP 200 `{ ok: false, message }` para que la PWA muestre el motivo.
- Registran eventos de seguridad cuando aplica.

## Decisiones de diseño

- **Un tiquete por comida/fecha:** evita doble consumo; el cupo del plan se valida antes de emitir.
- **Nonce en base de datos:** permite un control de un solo uso incluso con múltiples instancias de Edge Functions.
- **Token opaco:** el cliente no necesita entender el payload; solo lo transporta.
- **RLS + RPC:** las lecturas van por PostgREST con RLS; las mutaciones críticas van por RPC/Edge Functions para atomicidad.
- **Service role confinado:** el navegador solo usa la clave publicable.
- **PWA offline:** IndexedDB permite operar durante caídas de red; la sincronización es idempotente.
- **Sin integración de nómina en MVP:** el CSV de consumos queda listo para una integración posterior.

## Entornos

| Entorno | Frontend | Backend | Datos |
| --- | --- | --- | --- |
| Desarrollo | `npm run dev` | Proyecto Supabase | Datos demo |
| Producción | Netlify | Mismo proyecto Supabase | Datos demo del piloto |

Para un despliegue real se recomienda un proyecto Supabase separado por entorno y migraciones versionadas en el repo.
