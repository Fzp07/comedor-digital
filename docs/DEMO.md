# Guion de demo — Comedor Digital

Demo de 12–15 minutos para mostrar el flujo completo: empleado, operador, supervisor, RR.HH. y auditoría.

## 1. Antes de empezar

| Elemento | Valor |
| --- | --- |
| URL | https://comedor-digital.netlify.app |
| Contraseña de todas las cuentas | `Demo2026*` |
| PIN de empleado | `1234` |
| PIN de supervisor | `5678` |
| Fecha | La fecha actual de Bogotá |
| Ventana de almuerzo | 06:00–15:00 (piloto) |
| Ventana de merienda | 15:00–23:00 |

Abre tres ventanas o perfiles del navegador:

1. **Admin** — `admin@comedordigital.co`
2. **Empleado** — `empleado@comedordigital.co` (perfil incógnito)
3. **Operador** — `operador@comedordigital.co` (otro perfil incógnito)

Deja Supabase y Netlify abiertos en pestañas separadas solo si vas a mostrar infraestructura; no son necesarios para la demo funcional.

### Checklist técnico

- [ ] `require_device = false` para la demo básica (Configuración → Políticas).
- [ ] `require_mfa = false` para no bloquear las cuentas demo sin TOTP.
- [ ] La ventana de la comida elegida está abierta.
- [ ] El empleado demo no ha consumido esa comida hoy (ver script de reinicio).
- [ ] La cámara del portátil funciona o se usará el pegado manual del token.
- [ ] Notificaciones del navegador silenciadas.
- [ ] Zoom al 100 %; vista móvil para la parte del empleado.

## 2. Reinicio de datos demo

Ejecutar en **Supabase → SQL Editor** antes de la presentación. **No usar en producción.**

```sql
-- Limpia consumos de almuerzo de hoy para los empleados de la demo.
do $$
declare v_ticket uuid;
begin
  for v_ticket in
    select t.id
    from public.tickets t
    join public.employees e on e.id = t.employee_id
    where e.code in ('EMP-001','EMP-004','EMP-009')
      and t.service_date = (now() at time zone 'America/Bogota')::date
      and t.meal_type = 'almuerzo'
  loop
    delete from public.redemptions where ticket_id = v_ticket;
    delete from public.ticket_events where ticket_id = v_ticket and event_type = 'usado';
    update public.tickets set status = 'disponible', used_at = null where id = v_ticket;
  end loop;
end $$;

-- Políticas desactivadas para la demo básica (no dejar así en producción).
update public.company_settings
set require_device = false,
    require_mfa = false
where id = true;
```

> Si ya pasaron las 15:00, usa **merienda** en el guion y ejecuta el mismo bloque cambiando `'almuerzo'` por `'merienda'`.

## 3. Guion paso a paso

### 3.1 Apertura (1 min)

1. Abrir https://comedor-digital.netlify.app.
2. Mostrar que es una PWA instalable (icono de instalar en la barra de direcciones o menú del navegador).
3. Resaltar: **single-tenant**, español, móvil-first, sin registro público.
4. Clic en **Privacidad** y mostrar el aviso (Ley 1581, biometría opcional, minimización).

**Mensaje:** “Una sola empresa, varias sedes. El empleado no crea cuenta: RR.HH. lo carga y lo vincula.”

### 3.2 Login y dashboard (2 min)

1. Iniciar sesión como **Admin**.
2. Mostrar el dashboard: empleados activos, consumos de hoy, tiquetes disponibles, alertas.
3. Cambiar de sede en el filtro si está visible.
4. Abrir **Reportes** y mostrar el resumen diario por sede/comida.

**Mensaje:** “Los números salen de vistas con RLS; cada rol ve solo su sede.”

### 3.3 Empleados e importación (2 min)

1. Ir a **Empleados**.
2. Buscar `EMP-001`; abrir el detalle de Ana María Torres.
3. Mostrar sede, centro de costo, plan, estado, foto, consentimiento y credencial biométrica.
4. Cerrar y abrir **Importar CSV**; mostrar columnas aceptadas y detección de duplicados.
5. Si hay tiempo, descargar la plantilla y mostrar el resumen de errores.

**Mensaje:** “Código, documento y correo se validan contra duplicados. Nada se crea a medias.”

### 3.4 Planes y cupos (1 min)

1. Ir a **Planes**.
2. Mostrar “Almuerzo Estándar” y “Merienda Saludable”: comida, cupo, días, vigencia.
3. Mostrar la asignación a Ana María.

**Mensaje:** “El cupo del plan es el primer control; el segundo es el consumo único por comida/día.”

### 3.5 Emisión de tiquetes (2 min)

1. Ir a **Tiquetes → Emitir**.
2. Elegir Sede Central, **Almuerzo**, fecha de **mañana**.
3. Emitir para todos o para un subconjunto.
4. Mostrar el lote y el resumen: emitidos, omitidos por duplicado/sin plan.
5. Volver a emitir el mismo lote: el sistema detecta duplicados.
6. Abrir un tiquete y mostrar estados (`disponible`, `usado`, `anulado`, `vencido`).
7. Si se quiere mostrar anulación: seleccionar un tiquete **no usado**, anular con motivo (rol admin/supervisor).

**Mensaje:** “La emisión es idempotente por empleado/comida/fecha; el duplicado se rechaza y queda auditado.”

### 3.6 QR del empleado (2 min)

1. En la ventana incógnita, iniciar sesión como **Empleado**.
2. Abrir **Mi QR**.
3. Elegir **Almuerzo**.
4. Mostrar el QR, el contador de 45 segundos y el botón de refrescar.
5. No cerrar la ventana.

**Mensaje:** “El QR es dinámico, firmado con HMAC-SHA256, dura 45 segundos y tiene un nonce de un solo uso. No se puede reutilizar.”

### 3.7 Validación en caja (2 min)

1. En la ventana del **Operador**, abrir **Validar comedor**.
2. Verificar sede y comida (Almuerzo).
3. Escanear el QR con la cámara o pegar el token.
4. Resultado esperado: tarjeta verde con foto, nombre, código, plan, sede y “Consumo registrado”.
5. Repetir el mismo QR (o el mismo token): resultado esperado **“Ya consumió almuerzo hoy”** y evento de seguridad.
6. Mostrar “Últimos consumos” y el contador del día.

**Mensaje:** “El canje es atómico en Postgres: o se registra una vez, o se rechaza. No hay doble consumo.”

### 3.8 PIN de respaldo (1 min)

1. En la misma pantalla, pestaña **PIN**.
2. Código `EMP-009`, PIN `1234`, Almuerzo → **éxito**.
3. Repetir `EMP-009` → **duplicado**.
4. Probar `EMP-009` con PIN `0000` → **PIN incorrecto**; repetir varias veces para mostrar rate limit (8 intentos / 5 min).

**Mensaje:** “El PIN es el respaldo cuando no hay cámara o batería. Tiene rate limit y el mismo control de duplicado.”

### 3.9 Excepción de supervisor (2 min)

1. Pestaña **Excepción**.
2. Código `EMP-004`, Almuerzo.
3. Correo `supervisor@comedordigital.co`, PIN `5678`.
4. Motivo: “Autorizado por jefe de área, olvidó el celular” (≥ 10 caracteres).
5. Resultado esperado: consumo manual registrado con autorización.
6. Probar un PIN de supervisor incorrecto → rechazo.

**Mensaje:** “La excepción tiene doble control: operador + supervisor. Queda el motivo, el autorizador y la auditoría.”

### 3.10 Offline (opcional, 2 min)

1. En el operador, abrir DevTools → Network → **Offline**.
2. Generar un QR nuevo desde **Mi QR** (merienda si la ventana está abierta).
3. Validar en modo offline: el consumo se encola cifrado.
4. Volver a **Online** y pulsar **Sincronizar**.
5. Resultado: sincronizado; reintentar el mismo ítem → no se duplica.

**Mensaje:** “El comedor no se detiene si cae la red. La cola es cifrada e idempotente.”

> Si no hay tiempo, explicar el flujo con la tarjeta “Cola offline” y el botón de sincronización.

### 3.11 Auditoría y reportes (2 min)

1. Cambiar a **Admin**.
2. Ir a **Seguridad y auditoría**:
   - Eventos recientes (duplicado, PIN fallido, rate limit).
   - Auditoría append-only.
   - Dispositivos (mostrar la caja de prueba y el botón de revocar).
   - MFA (estado de usuarios privilegiados).
3. Ir a **Reportes**:
   - Resumen diario por sede/comida.
   - Centro de costo, plan, estado de tiquetes, excepciones, conciliación de cocina.
   - Exportar CSV y mostrar impresión/PDF.
4. Ir a **Historial**, filtrar por fecha/sede y abrir un consumo.

**Mensaje:** “Todo queda trazado. Los reportes son la operación y la auditoría es la evidencia.”

### 3.12 Cierre (1 min)

1. Mostrar `/privacidad` nuevamente.
2. Resumir controles: RLS, QR firmado, nonce, PIN, dispositivo, offline cifrado, auditoría, MFA.
3. Mencionar limitaciones del piloto: MFA sin enrolar, WebAuthn parcial, reporte programado sin SMTP, backups del plan actual.
4. Entregar URLs y cuentas.

## 4. Resultados esperados

| Paso | Resultado |
| --- | --- |
| Login admin | Dashboard con métricas y sedes |
| Empleado `EMP-001` | QR visible con contador de 45 s |
| Validar QR | Consumo registrado, tiquete `usado`, `redemption` creada |
| Reintentar QR | Rechazo por duplicado + evento de seguridad |
| PIN `EMP-009` / `1234` | Consumo registrado |
| PIN incorrecto | Rechazo + rate limit tras 8 intentos |
| Excepción `EMP-004` + supervisor `5678` | Consumo manual con motivo y autorizador |
| Emisión duplicada | Omitidos por duplicado, sin error fatal |
| Offline + sync | Sincronizado una vez; reintento idempotente |
| Auditoría | Eventos y cambios visibles para admin/auditor |

## 5. Frases clave

- “No es un papel digital: es un tiquete firmado, con nonce y ventana de validez.”
- “Ocultar un botón no es seguridad; la autorización está en RLS y en funciones del servidor.”
- “El service role nunca llega al navegador.”
- “El Operador no puede anular; el Auditor no puede modificar; RR.HH. no puede validar.”
- “Si se cae internet, la caja sigue; al volver, sincroniza sin duplicar.”
- “Cada excepción deja rastro: quién, cuándo, por qué y quién autorizó.”

## 6. Problemas frecuentes durante la demo

| Problema | Solución rápida |
| --- | --- |
| El QR no aparece | El empleado ya consumió esa comida hoy; ejecutar el reinicio o usar otra comida |
| “Fuera del horario” | Revisar la ventana en Configuración; usar almuerzo antes de las 15:00 |
| “El empleado pertenece a otra sede” | El operador es de Sede Central; usar un empleado de esa sede |
| “Dispositivo no autorizado” | Desactivar `require_device` o configurar el token de la caja |
| La cámara no abre | Usar el pegado manual del token o el PIN |
| El token expiró | Generar un QR nuevo; el TTL es 45 s |
| La cola offline no sincroniza | Volver a online; revisar el mensaje por ítem y el token de caja |
| Reporte vacío | Ajustar rango/filtros; recordar que RLS limita a la sede del usuario |

## 7. Después de la demo

- Restaurar `require_device` si la operación real lo exige.
- Revisar **Seguridad → Eventos** y resolver los generados por la demo.
- Si se anularon tiquetes, verificar el historial y la conciliación.
- No borrar la auditoría: es append-only y forma parte de la evidencia.
