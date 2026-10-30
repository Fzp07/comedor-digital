# Seguridad y cumplimiento — Comedor Digital

Documento vivo. Describe el modelo de seguridad implementado, los controles verificados, los riesgos aceptados del piloto y lo que falta antes de un despliegue productivo.

> **Alcance:** una sola empresa (single-tenant) con una o varias sedes. No hay registro público, facturación SaaS ni aislamiento entre empresas.

## 1. Principios

1. **Mínimo privilegio:** cada rol accede solo a lo que necesita. La UI oculta acciones, pero la autorización real vive en RLS y en funciones `SECURITY DEFINER`.
2. **Deny-by-default:** toda tabla del esquema `public` tiene RLS. Sin política aplicable, la fila no es visible ni modificable.
3. **Secretos en servidor:** la `service_role` solo existe en Edge Functions y en el entorno de Supabase. El navegador usa únicamente la clave publicable.
4. **Trazabilidad:** consumos, anulaciones, compensaciones, excepciones, dispositivos y cambios administrativos generan eventos.
5. **Defensa en profundidad:** QR firmado + nonce + ventana + cupo + dispositivo + rate limit + auditoría.
6. **Privacidad por diseño:** datos personales minimizados, consentimiento explícito y aviso de privacidad accesible.

## 2. Roles y separación de funciones

| Rol | Puede | No puede |
| --- | --- | --- |
| `admin` | Configurar empresa/sedes, gestionar usuarios y dispositivos, ver auditoría, todo lo operativo | — |
| `rrhh` | Empleados, planes, emisión de tiquetes, reportes | Anular/reemitir, validar consumos, administrar seguridad |
| `supervisor` | Validar QR/PIN, excepciones, anular/reemitir, compensar, reportes de su sede | Configurar empresa, gestionar usuarios/dispositivos |
| `operador` | Validar QR/PIN de su sede, modo offline | Anular, compensar, ver auditoría, gestionar personas |
| `auditor` | Lectura de reportes, historial y auditoría; exportaciones | Modificar datos, validar consumos |
| `empleado` | Ver su QR, sus tiquetes, su historial y sus consentimientos | Ver datos de otros empleados |

Controles de separación:

- Quien emite un tiquete (`rrhh`/`admin`) no es quien lo anula (`supervisor`/`admin`).
- Quien valida un consumo (`operador`/`supervisor`) no puede compensarlo sin rol de supervisión.
- El auditor no muta datos.
- El empleado solo se ve a sí mismo (`employees.user_id = auth.uid()`).
- La excepción exige un segundo factor humano: correo + PIN de supervisor, con motivo mínimo de 10 caracteres.

## 3. Autenticación y sesiones

- **Supabase Auth** con correo/contraseña. Contraseñas gestionadas por GoTrue (bcrypt).
- **JWT** con expiración y refresh token; el cliente usa PKCE.
- **MFA TOTP** disponible para todas las cuentas y visible en el centro de seguridad. La columna `profiles.mfa_enrolled` registra el estado.
- **Sesiones y dispositivos:** tabla `sessions` y tabla `devices` para cajas del comedor.
- **Revocación de dispositivo:** `revoke_device()` marca `status = 'revocado'`; la siguiente validación falla de inmediato.
- **Token de caja:** cadena opaca de al menos 32 caracteres; el servidor guarda solo `sha256(token)`. El token se escribe una vez en la caja y se guarda en `localStorage` del navegador autorizado.

### Estado del piloto

- Ningún usuario demo tiene TOTP enrolado todavía.
- Antes de producción: exigir MFA a `admin` y `supervisor`, y opcionalmente a `rrhh` y `auditor`.
- Activar **leaked password protection** en Supabase Auth (HaveIBeenPwned).

## 4. Autorización en base de datos

### 4.1 RLS

- RLS activo en **33 tablas** de `public`.
- `FORCE ROW LEVEL SECURITY` en 31 tablas; `rate_limits` y `kitchen_reconciliations` quedan sin `FORCE` para permitir tareas internas.
- `app_secrets`, `qr_nonces` y `rate_limits` no tienen políticas: **solo service role** puede leerlas/escribirlas.
- Las vistas de reportes usan `security_invoker = true`, por lo que heredan las políticas del usuario que consulta.
- Tablas append-only (`audit_log`, `security_events`, `ticket_events`, `device_events`) no tienen políticas de `UPDATE`/`DELETE`; los inserts ocurren por RPC `SECURITY DEFINER`.
- `audit_log` tiene un trigger que bloquea cualquier `UPDATE`/`DELETE`.

### 4.2 Funciones

Se corrigió una exposición detectada en revisión: Supabase concede `EXECUTE` a `PUBLIC`/`anon`/`authenticated` por defecto. La migración `010_lock_service_functions` revocó esos privilegios y los dejó solo en `service_role` para:

- `get_signing_secret()`
- `verify_employee_pin()`
- `verify_supervisor_pin()`
- `create_qr_nonce()`
- `consume_qr_nonce()`
- `check_rate_limit()`
- `redeem_ticket()`

Verificación realizada:

```text
get_signing_secret  como anon        → 401 permission denied
get_signing_secret  como empleado    → 403 permission denied
verify_employee_pin como anon        → 401 permission denied
verify_employee_pin como empleado    → 403 permission denied
redeem_ticket       como empleado    → 403 permission denied
get_employee_wallet como empleado    → 200 (RPC permitida)
qr-token            como empleado    → 200 (la Edge Function usa service role)
```

Las RPC de negocio (`issue_ticket_batch`, `cancel_ticket`, `compensate_redemption`, `register_device`, `revoke_device`, `resolve_security_event`, `set_employee_pin`, `save_kitchen_reconciliation`, `record_consent`, `set_my_mfa_enrolled`, `get_dashboard`, `get_employee_wallet`) quedaron solo para `authenticated` + `service_role`. Cada una valida rol, sede y/o propiedad dentro de la función.

Los helpers usados por RLS (`can_manage_people`, `can_read_site`, `can_supervise_site`, `current_app_role`, etc.) deben seguir siendo ejecutables por `authenticated`; solo devuelven booleanos y no exponen datos.

### 4.3 Triggers

`fn_audit_row`, `fn_guard_profile`, `fn_handle_new_user`, `fn_set_updated_at` y `fn_block_audit_mutation` ya no son ejecutables por `anon`/`authenticated` vía RPC.

`fn_guard_profile` impide que un usuario no administrador cambie su propio `role`, `site_id` o `active`.

## 5. QR dinámico

Formato:

```text
base64url(payload) + "." + base64url(HMAC-SHA256(payload, secreto))
payload = { v, e, s, m, n, exp, iat }
```

- `e` empleado, `s` sede, `m` comida, `n` nonce, `exp` expiración, `iat` emisión.
- TTL por defecto: **45 segundos** (`company_settings.qr_ttl_seconds`).
- Secreto HMAC en `app_secrets`, obtenido solo con `get_signing_secret()` (service role).
- Nonce persistido en `qr_nonces`; `consume_qr_nonce()` lo marca una sola vez.
- Validación en servidor: firma, TTL, nonce, empleado activo, sede, ventana, plan, cupo, duplicado y dispositivo.
- Reutilización: rechazo + evento de seguridad (`ticket_duplicado` / `nonce_reutilizado`).
- El token no contiene datos personales legibles; el cliente no puede fabricar uno válido.

## 6. PIN y excepción de supervisor

- PIN de empleado: 4–6 dígitos, hash bcrypt en `employees.pin_hash`; verificación con `crypt()` en extensión `pgcrypto`.
- PIN de supervisor: hash bcrypt en `profiles.override_pin_hash`; solo roles `supervisor`/`admin`.
- Rate limit por operador + código: **8 intentos / 5 minutos** para PIN.
- Rate limit de validación QR por operador/sede.
- La excepción exige motivo ≥ 10 caracteres y registra `overrides` + `redemptions` con `method = manual`.
- La excepción no evita el control de duplicado por empleado/comida/día.

## 7. Dispositivos del comedor

- Registro: `register_device(name, site_id, token)`; requiere `can_operate_site`.
- Hash SHA-256 del token en `devices.token_hash`; nunca se guarda el token en claro.
- Validación: si `company_settings.require_device = true`, el token es obligatorio; debe pertenecer a un dispositivo `activo` de la misma sede.
- `redemptions.device_id` queda asociado al consumo.
- `devices.last_seen_at` se actualiza en cada validación.
- Revocación inmediata con `revoke_device`; el evento queda en `device_events`.
- En la PWA, el token se configura desde **Operador → icono de caja** y se guarda en `localStorage` (`comedor_device_token`).

## 8. Offline

- Cola en IndexedDB (Dexie) cifrada con AES-GCM y clave derivada en el dispositivo.
- Cada ítem lleva `idempotency_key` única.
- `sync-offline` valida JWT, rol, sede, token de dispositivo, firma, nonce, expiración + gracia, plan, cupo y duplicado.
- El servidor registra `sync_batches` y devuelve resultado por ítem.
- Un reintento con la misma `idempotency_key` devuelve el consumo existente, no duplica.
- Política de gracia: `company_settings.offline_grace_minutes` (10 min por defecto).
- Riesgo aceptado: un dispositivo comprometido podría encolar consumos mientras está offline. Se mitiga con cifrado local, revocación, límite de 100 ítems por lote y conciliación posterior.

## 9. Auditoría y eventos

- `audit_log`: actor, rol, acción, entidad, `old_data`/`new_data`, timestamp. Append-only.
- `security_events`: duplicados, PIN fallido, rate limit, dispositivo no autorizado, offline, etc.; severidad y estado de resolución.
- `ticket_events`: transiciones de estado del tiquete.
- `device_events`: registro/revocación de cajas.
- `redemptions` y `overrides` son inmutables para el cliente; las correcciones se hacen con **compensación** + evento de auditoría, no borrando.
- Retención: tabla `data_retention_policies` preparada; la purga automática requiere job programado.

## 10. Cabeceras y superficie web

`next.config.ts` aplica:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(), geolocation=(self)`
- CSP con `default-src 'self'`, `connect-src` limitado a Supabase, `frame-ancestors 'none'`, `object-src 'none'`.
- `poweredByHeader: false`.

La cámara solo se usa para escanear QR; no se sube video ni imagen a Supabase.

## 11. Privacidad y Ley 1581 de Colombia

- Aviso de privacidad en `/privacidad`.
- Consentimientos en `consents`: tratamiento de datos y biometría, con versión y fecha.
- La biometría es **opcional**; siempre existe alternativa (QR/PIN).
- No se almacenan imágenes de huellas ni plantillas biométricas crudas. `biometric_credentials` guarda solo metadatos WebAuthn (credencial pública, contador, dispositivo).
- Minimización: el directorio y los reportes exponen solo los campos necesarios.
- Derechos del titular: acceso, corrección, supresión y revocación de consentimiento se atienden por RR.HH./administración; la base tiene soporte para revocar consentimientos y anonimizar.
- Transferencias: Supabase (Postgres/Auth/Storage) y Netlify (hosting) son encargados del tratamiento; documentar contrato y región (`sa-east-1`).
- Retención recomendada: consumos 24 meses, auditoría 5 años, CV/hojas de vida fuera del sistema. Ajustar con jurídica.

## 12. Respaldos y continuidad

- Supabase plan gratuito del piloto: backups automáticos limitados; **PITR no incluido**.
- Producción: plan con PITR, backups diarios verificados y prueba de restauración trimestral.
- Exportación de consumos y auditoría a CSV para respaldo externo.
- `backup_runs` y `data_retention_policies` existen para gobierno; falta automatizar el job.
- Incidente de seguridad: revocar dispositivos, rotar `QR_HMAC_SECRET` (nuevo secreto + redeploy), invalidar sesiones, revisar `security_events`/`audit_log`, notificar según Ley 1581.

## 13. Endurecimiento pendiente antes de producción

| Tema | Estado | Acción |
| --- | --- | --- |
| MFA obligatorio admin/supervisor | UI lista, sin enrolar | Enrolar TOTP y bloquear login sin MFA para roles privilegiados |
| Leaked password protection | Desactivado | Activar en Supabase Auth |
| Pentest externo | Pendiente | Contratar antes de go-live |
| SAST/DAST | CI con lint/build/tests | Añadir CodeQL, Semgrep y OWASP ZAP |
| Índices FK | 49 avisos de rendimiento | Crear índices en FKs críticas (`redemptions`, `tickets`, `security_events`) |
| `auth_rls_initplan` | 17 avisos | Usar `(select auth.uid())` en políticas de alto volumen |
| Rate limit distribuido | Tabla `rate_limits` | Migrar a Redis/Upstash si crece el volumen |
| WebAuthn completo | Modelo y UI parcial | Integrar SimpleWebAuthn con desafío servidor |
| Correo programado | Configuración persistida | Configurar proveedor SMTP/API + `pg_cron` |
| Backups/PITR | No en plan actual | Subir de plan y probar restauración |
| Columnas sensibles | `employees.pin_hash` legible por roles con SELECT | Mover a tabla separada o privilegios por columna |
| Sesiones | Registro básico | Añadir expiración, listado y revocación desde UI |

## 14. Checklist de revisión

- [x] RLS activo en todas las tablas de `public`.
- [x] Políticas por rol y sede; sin políticas para tablas de secretos.
- [x] `service_role` fuera del navegador y del repositorio.
- [x] Funciones sensibles solo `service_role`.
- [x] QR firmado, TTL y nonce de un solo uso.
- [x] Rate limit en PIN/QR.
- [x] Dispositivos con hash y revocación.
- [x] Auditoría append-only.
- [x] Aviso de privacidad y consentimientos.
- [x] Cabeceras CSP/HSTS.
- [ ] MFA obligatorio y enrolado.
- [ ] Pentest y DAST.
- [ ] PITR y prueba de restauración.
- [ ] Revisión legal de retención y contratos de encargados.
