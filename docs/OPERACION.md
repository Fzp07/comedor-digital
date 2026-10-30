# Manual de operación — Comedor Digital

Guía para administrar el piloto y para desplegar/operar la aplicación en producción.

## 1. Entornos y URLs

| Entorno | Frontend | Backend | Datos |
| --- | --- | --- | --- |
| Local | `http://localhost:3000` (`npm run dev`) | Proyecto Supabase `urkwubgdifcesfozdbbe` | Demo |
| Producción | https://comedor-digital.netlify.app | Mismo proyecto Supabase | Demo del piloto |

- Proyecto Supabase: `urkwubgdifcesfozdbbe` (región `sa-east-1`).
- Sitio Netlify: `comedor-digital` (`34d6ca31-d742-4cce-b42c-30b92f91b187`).
- Repositorio GitHub: pendiente de creación (ver README).

> Para un go-live real se recomienda **un proyecto Supabase por entorno** (`dev`, `staging`, `prod`) y migraciones versionadas en el repositorio.

## 2. Accesos y roles

| Persona | Rol | Uso |
| --- | --- | --- |
| Administrador de plataforma | `admin` | Configuración, usuarios, dispositivos, auditoría |
| Analista de RR.HH. | `rrhh` | Empleados, planes, emisión de tiquetes |
| Supervisor de comedor | `supervisor` | Excepciones, anulaciones, compensaciones, reportes |
| Operador de caja | `operador` | Validar QR/PIN, modo offline |
| Auditor interno | `auditor` | Consulta y exportación |
| Empleado | `empleado` | QR personal, tiquetes e historial |

Buenas prácticas:

- Una cuenta nominal por persona; nunca compartir credenciales.
- MFA obligatorio para `admin` y `supervisor` antes de producción.
- Revisar mensualmente quién tiene rol privilegiado y desactivar cuentas que ya no operan.
- El PIN de supervisor se entrega en persona y se rota ante cualquier sospecha.

## 3. Operación diaria

### 3.1 Apertura del comedor

1. Verificar que la caja tenga internet y que la PWA abra en `/app/operador`.
2. Confirmar la ventana de servicio correcta (almuerzo/merienda) y la sede.
3. Si la política `require_device` está activa, confirmar que la caja tenga configurado su token (icono de caja → “Caja autorizada”).
4. Probar un QR o PIN de prueba y confirmar que el consumo aparece en “Últimos consumos”.
5. Verificar que la cola offline esté vacía o que los pendientes se hayan sincronizado.

### 3.2 Validación

- **QR:** el empleado abre **Mi QR**, elige la comida y muestra el código. El operador escanea con la cámara o pega el token.
- **PIN:** código de empleado + PIN de 4–6 dígitos. Es el respaldo cuando no hay cámara, batería o conectividad.
- **Excepción:** solo si el empleado no tiene plan/tiquete y un supervisor autoriza. Requiere correo + PIN del supervisor y motivo ≥ 10 caracteres.
- Un empleado solo puede consumir **una vez por comida y día**. Un segundo intento se rechaza y genera evento.
- Si el sistema responde “fuera de horario”, “sin plan” o “tiquete vencido”, **no** forzar la excepción sin autorización.

### 3.3 Cierre

1. Sincronizar la cola offline antes de apagar la caja.
2. Revisar en **Dashboard** los consumos del día y las alertas.
3. Revisar **Seguridad y auditoría → Eventos** si hubo rechazos, duplicados o dispositivos no autorizados.
4. Registrar la conciliación de cocina (preparado vs. consumido) en **Reportes**.
5. Exportar el CSV del día si se requiere respaldo operativo.

## 4. Gestión de empleados

### 4.1 Alta individual

**Empleados → Nuevo empleado**. Campos mínimos:

- Código único (`EMP-001`), tipo y número de documento.
- Nombre completo, correo, teléfono, cargo.
- Sede y centro de costo.
- Estado (`activo`, `inactivo`, `retirado`, `suspendido`).
- Plan de alimentación (se asigna en **Planes** o desde el detalle).
- Foto opcional (JPG/PNG/WebP, máximo 5 MB).
- Consentimiento de tratamiento de datos; biometría solo si el empleado acepta.

### 4.2 Importación CSV

Columnas aceptadas (el orden es flexible; se detecta `,`, `;` o tabulación):

```csv
codigo,tipo_documento,documento,nombre,email,telefono,cargo,sede,centro_costo,estado
EMP-101,CC,1020304050,Ana María Torres,ana.torres@empresa.co,3001234567,Analista,Sede Central,ADMIN,activo
```

Reglas:

- `codigo`, `documento` y `email` se usan para detectar duplicados.
- `sede` y `centro_costo` aceptan código o nombre; deben existir.
- El estado por defecto es `activo`.
- Filas con errores se muestran en el resumen de importación; no se crean parcialmente.
- Exportar primero la plantilla desde la misma pantalla para evitar diferencias de encabezados.

### 4.3 Bajas

- Cambiar estado a `retirado` o `inactivo`; no borrar empleados con historial.
- Revocar el acceso del usuario en Supabase Auth si tenía cuenta.
- Los tiquetes emitidos y no usados se pueden anular con motivo.

## 5. Planes, cupos y tiquetes

### 5.1 Planes

**Planes** define:

- Nombre, comida (`desayuno`, `almuerzo`, `merienda`), cupo por día.
- Días permitidos (1 = lunes … 7 = domingo).
- Vigencia y estado.
- Asignación a empleados con fecha de inicio/fin.

Un empleado sin plan activo para la comida/fecha no puede generar QR ni consumir por PIN (salvo excepción de supervisor).

### 5.2 Emisión

**Tiquetes → Emitir**:

- Individual o por lote (todos los empleados de una sede o selección).
- Fecha de servicio y ventana de validez.
- El sistema detecta duplicados por empleado/comida/fecha y los reporta como omitidos.
- La emisión queda auditada (`ticket_batches`, `ticket_events`, `audit_log`).

### 5.3 Anulación y reemisión

- Solo `supervisor` o `admin`.
- Requiere motivo.
- Un tiquete **usado** no se anula: se compensa el consumo (ver 6.3).
- Reemitir crea un nuevo tiquete y deja el anterior anulado con su evento.

## 6. Historial, excepciones y compensaciones

### 6.1 Historial

- **Empleado:** sus últimos consumos y tiquetes.
- **Admin/RR.HH./Supervisor/Auditor:** filtros por fecha, sede, comida, método, estado y empleado.
- Exportación CSV/Excel desde la misma pantalla.

### 6.2 Excepción

Se usa cuando el empleado no tiene plan/tiquete pero el comedor autoriza el consumo:

1. Operador elige **Excepción**.
2. Ingresa código de empleado, comida, correo y PIN del supervisor, y motivo.
3. El sistema valida rol del supervisor, sede, PIN y motivo.
4. Se crea `overrides` + `redemptions` (`method = manual`) y se audita.

Límite: `company_settings.max_overrides_per_day` (3 por defecto). Cada excepción debe revisarse al cierre.

### 6.3 Compensación

Si un consumo fue erróneo:

1. **Historial → detalle → Compensar**.
2. Motivo obligatorio.
3. El consumo queda `compensado`; el tiquete se anula; se crea evento de auditoría.
4. Nunca se borra la fila original.

## 7. Dispositivos de caja

### 7.1 Registrar

1. **Seguridad y auditoría → Dispositivos → Registrar**.
2. Nombre descriptivo, sede, token (generar uno aleatorio de 64 caracteres o usar el sugerido).
3. Copiar el token **una sola vez**; no se vuelve a mostrar.
4. En la caja: **Operador → icono de caja → pegar token → Guardar**.
5. Probar una validación; el consumo debe quedar con `device_id`.

### 7.2 Exigir dispositivo

**Configuración → Políticas → “Exigir dispositivo registrado”**.

- Si está activo, una caja sin token o con token revocado no puede validar.
- Si está inactivo, se permite validar sin token (modo piloto).
- El cambio aplica de inmediato a las Edge Functions.

### 7.3 Revocar

**Seguridad → Dispositivos → Revocar**. El token deja de servir inmediatamente. Si se pierde la caja, revocar y registrar una nueva.

## 8. Configuración

**Configuración** permite ajustar:

- Empresa: nombre, NIT, logo, color, zona horaria, moneda, locale.
- Tiquetes: vigencia en minutos, TTL del QR.
- Offline: permitir/negociar, minutos de gracia.
- Excepciones: máximo por día.
- Reportes: destinatarios, frecuencia, hora, activar/desactivar.
- Sedes, ventanas de servicio, centros de costo, menús.
- Políticas: exigir dispositivo.

Los cambios quedan en `audit_log` cuando la tabla lo amerita.

## 9. Despliegue

### 9.1 Frontend en Netlify

Requisitos:

- Variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el sitio.
- Build `npm run build`; el plugin de Next.js publica `.next`.

Desde la raíz del proyecto:

```bash
npm ci
npm run lint
npm test
npm run build
npx netlify deploy --prod
```

Con el MCP de Netlify (usado en este entorno):

```bash
npx -y @netlify/mcp@latest --site-id 34d6ca31-d742-4cce-b42c-30b92f91b187 --proxy-path "<proxy>"
```

Luego verificar:

```text
GET /                 → 200
GET /login            → 200
GET /privacidad       → 200
GET /manifest.webmanifest → 200
GET /offline          → 200
```

### 9.2 Supabase

- Migraciones aplicadas: `001_core_schema` … `011_harden_trigger_functions`.
- Edge Functions: `qr-token`, `validate-qr`, `validate-pin`, `validate-override`, `sync-offline`.
- Todas con `verify_jwt: true`.
- Variables de función: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (las inyecta Supabase).
- Secreto de firma: `app_secrets.qr_hmac_secret`; obtenerlo solo con `get_signing_secret()`.

Despliegue de funciones (requiere Supabase CLI autenticada):

```bash
supabase link --project-ref urkwubgdifcesfozdbbe
supabase functions deploy qr-token
supabase functions deploy validate-qr
supabase functions deploy validate-pin
supabase functions deploy validate-override
supabase functions deploy sync-offline
```

### 9.3 Rotación del secreto QR

1. Generar un secreto nuevo (32+ bytes aleatorios).
2. Actualizar `app_secrets.qr_hmac_secret`.
3. Avisar a los operadores: los QR emitidos antes dejan de ser válidos.
4. Verificar emisión y validación.
5. Registrar el cambio en la bitácora y revisar eventos.

## 10. Monitoreo y alertas

Revisar a diario:

- **Dashboard:** consumos, tiquetes disponibles/usados, alertas.
- **Seguridad:** eventos `critical`/`warning` sin resolver, dispositivos no autorizados, rate limits.
- **Reportes:** conciliación de cocina y excepciones.
- **Netlify:** estado del deploy y logs de funciones.
- **Supabase:** salud del proyecto, uso de base de datos, errores de Edge Functions.

Alertas recomendadas:

- Duplicados o nonce reutilizado > 5 en 10 minutos.
- Intentos de PIN fallidos > 20 en 5 minutos.
- Dispositivo revocado intentando validar.
- Caída del frontend (uptime check).
- Backups fallidos.

## 11. Respaldos y restauración

- **Piloto:** backups automáticos del plan actual; exportar CSV semanal de consumos y auditoría.
- **Producción:** PITR + backup diario + retención ≥ 30 días.
- Prueba de restauración trimestral en un proyecto de staging.
- Antes de migraciones grandes: snapshot manual y export de tablas críticas.

Restauración lógica (si hay backup):

1. Crear proyecto Supabase de staging.
2. Restaurar backup/PITR.
3. Aplicar migraciones pendientes.
4. Validar RLS, funciones y Edge Functions.
5. Cambiar variables de Netlify al proyecto restaurado solo si el negocio lo aprueba.

## 12. Incidentes

### 12.1 Caja comprometida o token filtrado

1. **Seguridad → Dispositivos → Revocar**.
2. Revisar `redemptions` y `security_events` del dispositivo.
3. Registrar una caja nueva y entregar el token en persona.
4. Si hubo consumos fraudulentos, compensar y documentar.

### 12.2 QR clonado o reutilizado

1. Revisar `security_events` (`ticket_duplicado`, `nonce_reutilizado`).
2. Identificar empleado, operador, sede y hora.
3. Si hay patrón, rotar el secreto QR y revocar sesiones.
4. Informar a RR.HH. y seguridad.

### 12.3 Caída de Supabase o internet

- El operador puede seguir validando en modo offline (si está habilitado).
- La cola se sincroniza al volver la red.
- Si la caída es prolongada, usar lista manual y conciliar al final del día; no duplicar consumos.

### 12.4 Error de despliegue

1. Netlify → Deploys → rollback al deploy anterior.
2. Si el error es de datos, no revertir migraciones a ciegas; restaurar backup y aplicar corrección.
3. Comunicar a operadores y RR.HH.

## 13. Mantenimiento

| Frecuencia | Tarea |
| --- | --- |
| Diario | Revisar dashboard, eventos y cola offline |
| Semanal | Exportar consumos, revisar excepciones y conciliación |
| Mensual | Revisar usuarios/roles, dispositivos, intentos fallidos, espacio |
| Trimestral | Prueba de restauración, revisión de accesos, actualización de dependencias |
| Anual | Pentest, revisión de retención, auditoría de contratos y privacidad |

Actualizar dependencias:

```bash
npm outdated
npm update
npm run lint && npm test && npm run build
```

## 14. Solución de problemas

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| “Sesión inválida” | Token expirado o usuario desactivado | Volver a iniciar sesión; revisar `profiles.active` |
| “Tu rol no está autorizado para validar” | Rol distinto de admin/operador/supervisor | Asignar rol correcto o usar cuenta autorizada |
| “El empleado pertenece a otra sede” | Operador/caja de otra sede | Validar en la sede correcta o usar admin |
| “El dispositivo no está autorizado o fue revocado” | Token ausente/incorrecto o caja revocada | Configurar token vigente en la caja |
| “Fuera del horario de servicio” | Ventana mal configurada o fuera de hora | Revisar **Configuración → Ventanas** |
| “Sin plan activo” | Plan no asignado o vencido | Asignar plan en **Planes** |
| “Ya consumió hoy” | Duplicado real | No forzar; revisar historial y excepción |
| QR no escanea | Cámara bloqueada o token vencido | Permitir cámara, regenerar QR o usar PIN |
| Cola offline no sincroniza | Sin red, token inválido o ítem rechazado | Revisar mensaje por ítem; corregir y reintentar |
| Reporte vacío | Rango/filtros o RLS por sede | Ajustar filtros; verificar sede del usuario |
| Error 403 en RPC | Función revocada o rol sin permiso | Revisar políticas y grants; no otorgar `service_role` al cliente |

## 15. Contactos y responsabilidades

| Responsabilidad | Rol |
| --- | --- |
| Disponibilidad del frontend y despliegues | Administrador de plataforma |
| Altas/bajas de empleados y planes | RR.HH. |
| Operación del comedor y excepciones | Supervisor |
| Validación en caja | Operador |
| Auditoría y reportes | Auditor |
| Incidentes de seguridad y privacidad | Admin + oficial de datos |

Documentar cada incidente en la bitácora interna con fecha, impacto, acciones y responsables.
