"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Factor } from "@supabase/supabase-js";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Database,
  Download,
  Eye,
  FileText,
  Fingerprint,
  KeyRound,
  Laptop,
  Lock,
  MonitorSmartphone,
  Plus,
  Power,
  RefreshCw,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserCheck,
  XCircle,
} from "lucide-react";
import { RoleGate } from "@/components/app-shell";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CheckItem,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  ProgressBar,
  SearchInput,
  Select,
  Skeleton,
  StatCard,
  Tabs,
} from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { supabase } from "@/lib/supabase";
import type { AuditEntry, Device, Profile, SecurityEvent, Site } from "@/lib/types";
import { addDaysISO, downloadCsv, formatDateTime, formatDate, relativeTime, ROLE_LABELS, todayISO } from "@/lib/utils";

interface AuditRow extends AuditEntry {
  actor_name: string | null;
  actor_email: string | null;
}

interface EventRow extends SecurityEvent {
  user_name: string | null;
  user_email: string | null;
  site_name: string | null;
}

interface MfaEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

const EVENT_LABELS: Record<string, string> = {
  intento_fuera_horario: "Intento fuera de horario",
  ticket_duplicado: "Tiquete duplicado",
  dispositivo_offline: "Sincronización offline",
  pin_fallido: "PIN incorrecto",
  override_excedido: "Límite de excepciones",
  dispositivo_revocado: "Dispositivo revocado",
  sesion_sospechosa: "Sesión sospechosa",
  qr_invalido: "QR inválido",
  qr_expirado: "QR expirado",
};

const SEVERITY_LABELS: Record<string, string> = {
  info: "Informativo",
  warning: "Advertencia",
  critical: "Crítico",
};

const SEVERITY_VARIANTS: Record<string, "info" | "warning" | "danger"> = {
  info: "info",
  warning: "warning",
  critical: "danger",
};

const ACTION_LABELS: Record<string, string> = {
  insert: "Creación",
  update: "Actualización",
  delete: "Eliminación",
  cancel: "Anulación",
  compensate: "Compensación",
  redeem: "Consumo",
  login: "Inicio de sesión",
};

function bogotaDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hexToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function SecurityPage() {
  return (
    <RoleGate roles={["admin", "auditor"]}>
      <SecurityContent />
    </RoleGate>
  );
}

function SecurityContent() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const isAdmin = profile?.role === "admin";

  const [tab, setTab] = useState("eventos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [counts, setCounts] = useState({ employees: 0, consentsGranted: 0, biometricsActive: 0 });

  const [severityFilter, setSeverityFilter] = useState("todas");
  const [resolvedFilter, setResolvedFilter] = useState("todos");
  const [eventSearch, setEventSearch] = useState("");
  const [busyEvent, setBusyEvent] = useState<number | null>(null);

  const [auditSearch, setAuditSearch] = useState("");
  const [auditAction, setAuditAction] = useState("todas");
  const [auditEntity, setAuditEntity] = useState("todas");
  const [auditFrom, setAuditFrom] = useState(addDaysISO(-30));
  const [auditTo, setAuditTo] = useState(todayISO());
  const [auditDetail, setAuditDetail] = useState<AuditRow | null>(null);

  const [deviceModal, setDeviceModal] = useState(false);
  const [deviceForm, setDeviceForm] = useState({ name: "", site_id: "" });
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [savingDevice, setSavingDevice] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{ name: string; token: string } | null>(null);
  const [revoking, setRevoking] = useState<Device | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const [factors, setFactors] = useState<Factor[]>([]);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollment | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const [eventsResult, auditResult, devicesResult, profilesResult, sitesResult, employeeCount, consentRows, biometricRows] =
      await Promise.all([
        supabase.from("security_events").select("*").order("created_at", { ascending: false }).limit(400),
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(800),
        supabase.from("devices").select("*, sites(name)").order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("id,email,full_name,role,site_id,phone,active,mfa_enrolled,last_seen_at,created_at")
          .order("full_name"),
        supabase.from("sites").select("*").eq("active", true).order("name"),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "activo"),
        supabase.from("consents").select("employee_id,consent_type,granted,revoked_at").eq("granted", true),
        supabase.from("biometric_credentials").select("id,revoked_at"),
      ]);

    const firstError = [
      eventsResult.error,
      auditResult.error,
      devicesResult.error,
      profilesResult.error,
      sitesResult.error,
      employeeCount.error,
    ].find(Boolean);

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const profileRows = (profilesResult.data ?? []) as Profile[];
    const profileMap = new Map(profileRows.map((item) => [item.id, item]));
    const siteRows = (sitesResult.data ?? []) as Site[];
    const siteMap = new Map(siteRows.map((item) => [item.id, item]));

    setProfiles(profileRows);
    setSites(siteRows);
    setEvents(
      ((eventsResult.data ?? []) as SecurityEvent[]).map((event) => {
        const user = event.user_id ? profileMap.get(event.user_id) : undefined;
        return {
          ...event,
          user_name: user?.full_name ?? null,
          user_email: user?.email ?? null,
          site_name: event.site_id ? siteMap.get(event.site_id)?.name ?? null : null,
        };
      }),
    );
    setAudit(
      ((auditResult.data ?? []) as AuditEntry[]).map((entry) => {
        const actor = entry.actor_id ? profileMap.get(entry.actor_id) : undefined;
        return { ...entry, actor_name: actor?.full_name ?? null, actor_email: actor?.email ?? null };
      }),
    );
    setDevices((devicesResult.data ?? []) as unknown as Device[]);

    const grantedConsentEmployees = new Set(
      ((consentRows.data ?? []) as Array<{ employee_id: string; revoked_at: string | null }>)
        .filter((row) => !row.revoked_at)
        .map((row) => row.employee_id),
    );
    setCounts({
      employees: employeeCount.count ?? 0,
      consentsGranted: grantedConsentEmployees.size,
      biometricsActive: ((biometricRows.data ?? []) as Array<{ revoked_at: string | null }>).filter((row) => !row.revoked_at)
        .length,
    });
    setLoading(false);
    setRefreshing(false);
  }, []);

  const loadMfa = useCallback(async () => {
    setMfaLoading(true);
    const { data, error: mfaListError } = await supabase.auth.mfa.listFactors();
    if (mfaListError) {
      setMfaError(mfaListError.message);
      setMfaLoading(false);
      return;
    }
    setFactors((data?.all ?? []).filter((factor) => factor.factor_type === "totp" && factor.status === "verified"));
    setMfaLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void loadMfa();
  }, [load, loadMfa]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab")) setTab(url.searchParams.get("tab") ?? "eventos");
  }, []);

  const pendingEvents = useMemo(() => events.filter((event) => !event.resolved), [events]);
  const criticalEvents = useMemo(() => events.filter((event) => event.severity === "critical"), [events]);
  const activeDevices = useMemo(() => devices.filter((device) => device.status === "activo"), [devices]);
  const mfaProfiles = useMemo(() => profiles.filter((item) => item.mfa_enrolled), [profiles]);
  const privilegedWithoutMfa = useMemo(
    () =>
      profiles.filter(
        (item) => item.active && ["admin", "supervisor"].includes(item.role) && !item.mfa_enrolled,
      ),
    [profiles],
  );

  const filteredEvents = useMemo(() => {
    const term = eventSearch.trim().toLowerCase();
    return events.filter((event) => {
      if (severityFilter !== "todas" && event.severity !== severityFilter) return false;
      if (resolvedFilter === "pendientes" && event.resolved) return false;
      if (resolvedFilter === "resueltos" && !event.resolved) return false;
      if (!term) return true;
      return [event.event_type, EVENT_LABELS[event.event_type], event.user_name, event.user_email, event.site_name, JSON.stringify(event.details)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [eventSearch, events, resolvedFilter, severityFilter]);

  const auditActions = useMemo(() => Array.from(new Set(audit.map((entry) => entry.action))).sort(), [audit]);
  const auditEntities = useMemo(() => Array.from(new Set(audit.map((entry) => entry.entity))).sort(), [audit]);

  const filteredAudit = useMemo(() => {
    const term = auditSearch.trim().toLowerCase();
    return audit.filter((entry) => {
      if (auditAction !== "todas" && entry.action !== auditAction) return false;
      if (auditEntity !== "todas" && entry.entity !== auditEntity) return false;
      const dateKey = bogotaDateKey(entry.created_at);
      if (auditFrom && dateKey < auditFrom) return false;
      if (auditTo && dateKey > auditTo) return false;
      if (!term) return true;
      return [entry.actor_name, entry.actor_email, entry.action, entry.entity, entry.entity_id, JSON.stringify(entry.old_data), JSON.stringify(entry.new_data)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [audit, auditAction, auditEntity, auditFrom, auditSearch, auditTo]);

  async function toggleEvent(event: EventRow) {
    if (!isAdmin) return;
    setBusyEvent(event.id);
    const { error: rpcError } = await supabase.rpc("resolve_security_event", {
      p_event_id: event.id,
      p_resolved: !event.resolved,
    });
    setBusyEvent(null);
    if (rpcError) {
      toast({ title: "No pudimos actualizar el evento", description: rpcError.message, variant: "error" });
      return;
    }
    setEvents((current) =>
      current.map((item) => (item.id === event.id ? { ...item, resolved: !item.resolved } : item)),
    );
    toast({
      title: event.resolved ? "Evento reabierto" : "Evento resuelto",
      description: "La acción quedó registrada con tu usuario.",
      variant: "success",
    });
  }

  function exportAudit() {
    downloadCsv(
      `auditoria-${auditFrom}-a-${auditTo}.csv`,
      filteredAudit.map((entry) => ({
        fecha: formatDateTime(entry.created_at),
        usuario: entry.actor_name ?? entry.actor_email ?? "Sistema",
        rol: entry.actor_role ? ROLE_LABELS[entry.actor_role] : "",
        accion: ACTION_LABELS[entry.action] ?? entry.action,
        entidad: entry.entity,
        registro: entry.entity_id ?? "",
        datos_anteriores: entry.old_data ? JSON.stringify(entry.old_data) : "",
        datos_nuevos: entry.new_data ? JSON.stringify(entry.new_data) : "",
      })),
      [
        { key: "fecha", label: "Fecha" },
        { key: "usuario", label: "Usuario" },
        { key: "rol", label: "Rol" },
        { key: "accion", label: "Acción" },
        { key: "entidad", label: "Entidad" },
        { key: "registro", label: "Registro" },
        { key: "datos_anteriores", label: "Datos anteriores" },
        { key: "datos_nuevos", label: "Datos nuevos" },
      ],
    );
    toast({ title: "Auditoría exportada", description: `${filteredAudit.length} registros en CSV.`, variant: "success" });
  }

  function openDevice() {
    setDeviceForm({ name: "", site_id: profile?.site_id ?? sites[0]?.id ?? "" });
    setDeviceError(null);
    setIssuedToken(null);
    setDeviceModal(true);
  }

  async function registerDevice() {
    if (!deviceForm.name.trim() || deviceForm.name.trim().length < 3) {
      setDeviceError("Escribe un nombre de al menos 3 caracteres para identificar la caja.");
      return;
    }
    if (!deviceForm.site_id) {
      setDeviceError("Selecciona la sede donde operará el dispositivo.");
      return;
    }
    setSavingDevice(true);
    setDeviceError(null);
    const token = hexToken(32);
    const { data, error: rpcError } = await supabase.rpc("register_device", {
      p_name: deviceForm.name.trim(),
      p_site_id: deviceForm.site_id,
      p_token: token,
    });
    setSavingDevice(false);
    if (rpcError) {
      setDeviceError(rpcError.message);
      return;
    }
    const returned = data as { ok?: boolean; device_id?: string } | null;
    if (!returned?.ok) {
      setDeviceError("El servidor no confirmó el registro del dispositivo.");
      return;
    }
    setIssuedToken({ name: deviceForm.name.trim(), token });
    setDeviceForm({ name: "", site_id: deviceForm.site_id });
    toast({
      title: "Dispositivo registrado",
      description: "Copia el token ahora: no se volverá a mostrar y solo se guardó su hash.",
      variant: "success",
    });
    await load(true);
  }

  async function revokeDevice() {
    if (!revoking) return;
    setRevokeBusy(true);
    const { error: rpcError } = await supabase.rpc("revoke_device", { p_device_id: revoking.id });
    setRevokeBusy(false);
    if (rpcError) {
      toast({ title: "No pudimos revocar el dispositivo", description: rpcError.message, variant: "error" });
      return;
    }
    toast({ title: "Dispositivo revocado", description: `${revoking.name} ya no puede validar consumos.`, variant: "success" });
    setRevoking(null);
    await load(true);
  }

  async function copyToken() {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken.token);
      toast({ title: "Token copiado", description: "Guárdalo en el gestor de secretos de la caja.", variant: "success" });
    } catch {
      toast({ title: "No pudimos copiar", description: "Selecciona el token y cópialo manualmente.", variant: "warning" });
    }
  }

  async function startMfaEnrollment() {
    setMfaError(null);
    setMfaBusy(true);
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Comedor Digital",
    });
    setMfaBusy(false);
    if (enrollError) {
      setMfaError(enrollError.message);
      return;
    }
    if (!data?.totp) {
      setMfaError("El proveedor no devolvió la configuración TOTP.");
      return;
    }
    setMfaEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    setMfaCode("");
  }

  async function confirmMfaEnrollment() {
    if (!mfaEnrollment) return;
    if (!/^\d{6}$/.test(mfaCode)) {
      setMfaError("Ingresa el código de 6 dígitos de tu aplicación autenticadora.");
      return;
    }
    setMfaBusy(true);
    setMfaError(null);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: mfaEnrollment.factorId,
    });
    if (challengeError || !challenge) {
      setMfaBusy(false);
      setMfaError(challengeError?.message ?? "No pudimos iniciar la verificación.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mfaEnrollment.factorId,
      challengeId: challenge.id,
      code: mfaCode,
    });
    if (verifyError) {
      setMfaBusy(false);
      setMfaError(verifyError.message);
      return;
    }
    const { error: flagError } = await supabase.rpc("set_my_mfa_enrolled", { p_enrolled: true });
    setMfaBusy(false);
    if (flagError) {
      setMfaError(flagError.message);
      return;
    }
    setMfaEnrollment(null);
    setMfaCode("");
    toast({ title: "MFA activado", description: "Tu cuenta ahora exige un segundo factor para iniciar sesión.", variant: "success" });
    await Promise.all([loadMfa(), refreshProfile(), load(true)]);
  }

  async function removeFactor(factor: Factor) {
    setMfaBusy(true);
    setMfaError(null);
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (unenrollError) {
      setMfaBusy(false);
      setMfaError(unenrollError.message);
      return;
    }
    const remaining = factors.filter((item) => item.id !== factor.id);
    const { error: flagError } = await supabase.rpc("set_my_mfa_enrolled", { p_enrolled: remaining.length > 0 });
    setMfaBusy(false);
    if (flagError) {
      setMfaError(flagError.message);
      return;
    }
    toast({ title: "Factor eliminado", description: "Actualiza tu política de acceso si era obligatorio.", variant: "info" });
    await Promise.all([loadMfa(), refreshProfile(), load(true)]);
  }

  const consentPercent = counts.employees ? Math.round((counts.consentsGranted / counts.employees) * 100) : 0;

  if (loading && profiles.length === 0 && events.length === 0) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28" />)}
        </div>
        <Skeleton className="h-[28rem]" />
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Gobierno y control"
        title="Seguridad y auditoría"
        description="Eventos de seguridad, trazabilidad inmutable, dispositivos autorizados y segundo factor para cuentas privilegiadas."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportAudit} disabled={filteredAudit.length === 0}>
              Exportar auditoría
            </Button>
            <Button variant="ghost" size="icon" onClick={() => void load(true)} aria-label="Recargar" disabled={refreshing}>
              <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </>
        }
      />

      {error ? <Alert variant="danger" title="No pudimos cargar el centro de seguridad">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Eventos pendientes"
          value={pendingEvents.length}
          hint={`${events.length} eventos en total`}
          icon={<ShieldAlert className="size-5" />}
          tone={pendingEvents.length ? "clay" : "brand"}
        />
        <StatCard
          label="Eventos críticos"
          value={criticalEvents.length}
          hint={`${criticalEvents.filter((event) => !event.resolved).length} sin resolver`}
          icon={<AlertTriangle className="size-5" />}
          tone={criticalEvents.length ? "citrus" : "brand"}
        />
        <StatCard
          label="Dispositivos activos"
          value={activeDevices.length}
          hint={`${devices.length} registrados en total`}
          icon={<MonitorSmartphone className="size-5" />}
          tone="sky"
        />
        <StatCard
          label="Usuarios con MFA"
          value={mfaProfiles.length}
          hint={`${profiles.filter((item) => item.active).length} usuarios activos`}
          icon={<ShieldCheck className="size-5" />}
          tone={privilegedWithoutMfa.length ? "citrus" : "brand"}
        />
      </div>

      {privilegedWithoutMfa.length > 0 ? (
        <Alert variant="warning" className="mt-4" title="Hay cuentas privilegiadas sin segundo factor">
          {privilegedWithoutMfa.map((item) => item.full_name ?? item.email ?? "Usuario").join(", ")}. Activa MFA en la pestaña
          «MFA y privacidad» antes de pasar a producción.
        </Alert>
      ) : null}

      <div className="mt-4">
        <Tabs
          tabs={[
            { value: "eventos", label: "Eventos", count: pendingEvents.length },
            { value: "auditoria", label: "Auditoría", count: audit.length },
            { value: "dispositivos", label: "Dispositivos", count: devices.length },
            { value: "mfa", label: "MFA y privacidad" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "eventos" ? (
        <Card className="mt-4">
          <CardHeader className="flex-col items-stretch gap-3 xl:flex-row xl:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} className="w-auto">
                <option value="todas">Todas las severidades</option>
                <option value="critical">Críticos</option>
                <option value="warning">Advertencias</option>
                <option value="info">Informativos</option>
              </Select>
              <Select value={resolvedFilter} onChange={(event) => setResolvedFilter(event.target.value)} className="w-auto">
                <option value="todos">Todos los estados</option>
                <option value="pendientes">Pendientes</option>
                <option value="resueltos">Resueltos</option>
              </Select>
              <SearchInput
                value={eventSearch}
                onChange={setEventSearch}
                placeholder="Buscar evento, usuario o detalle…"
                className="w-full sm:w-72"
              />
            </div>
            <Badge variant="outline">{filteredEvents.length} eventos</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {filteredEvents.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="size-5" />}
                title="Sin eventos para este filtro"
                description="Los intentos rechazados, duplicados y sincronizaciones offline aparecen aquí automáticamente."
              />
            ) : (
              <div className="divide-y divide-line/70">
                {filteredEvents.map((event) => (
                  <div key={event.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start">
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                        event.severity === "critical"
                          ? "bg-clay-100 text-clay-500"
                          : event.severity === "warning"
                            ? "bg-citrus-100 text-[#8a6110]"
                            : "bg-sky-100 text-[#235f70]"
                      }`}
                    >
                      {event.severity === "critical" ? <ShieldAlert className="size-4" /> : event.severity === "warning" ? <AlertTriangle className="size-4" /> : <Activity className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-ink">{EVENT_LABELS[event.event_type] ?? event.event_type}</p>
                        <Badge variant={SEVERITY_VARIANTS[event.severity] ?? "muted"}>
                          {SEVERITY_LABELS[event.severity] ?? event.severity}
                        </Badge>
                        <Badge variant={event.resolved ? "success" : "outline"}>{event.resolved ? "Resuelto" : "Pendiente"}</Badge>
                      </div>
                      <p className="mt-1 text-[10px] text-muted">
                        {formatDateTime(event.created_at)}
                        {event.user_name || event.user_email ? ` · ${event.user_name ?? event.user_email}` : " · Sistema"}
                        {event.site_name ? ` · ${event.site_name}` : ""}
                      </p>
                      <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-paper/60 px-2.5 py-2 text-[9px] leading-relaxed text-muted">
                        {JSON.stringify(event.details, null, 2)}
                      </pre>
                    </div>
                    {isAdmin ? (
                      <Button
                        variant={event.resolved ? "ghost" : "secondary"}
                        size="sm"
                        loading={busyEvent === event.id}
                        onClick={() => void toggleEvent(event)}
                        icon={event.resolved ? <RefreshCw className="size-3.5" /> : <Check className="size-3.5" />}
                      >
                        {event.resolved ? "Reabrir" : "Resolver"}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "auditoria" ? (
        <Card className="mt-4">
          <CardHeader className="flex-col items-stretch gap-3 xl:flex-row xl:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Input type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} className="w-auto" aria-label="Desde" />
              <span className="text-[10px] text-muted">a</span>
              <Input type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} className="w-auto" aria-label="Hasta" />
              <Select value={auditAction} onChange={(event) => setAuditAction(event.target.value)} className="w-auto">
                <option value="todas">Todas las acciones</option>
                {auditActions.map((action) => (
                  <option key={action} value={action}>{ACTION_LABELS[action] ?? action}</option>
                ))}
              </Select>
              <Select value={auditEntity} onChange={(event) => setAuditEntity(event.target.value)} className="w-auto">
                <option value="todas">Todas las entidades</option>
                {auditEntities.map((entity) => (
                  <option key={entity} value={entity}>{entity}</option>
                ))}
              </Select>
              <SearchInput
                value={auditSearch}
                onChange={setAuditSearch}
                placeholder="Buscar usuario, registro o dato…"
                className="w-full sm:w-72"
              />
            </div>
            <Badge variant="outline">{filteredAudit.length} registros</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {filteredAudit.length === 0 ? (
              <EmptyState
                icon={<SearchX className="size-5" />}
                title="Sin registros de auditoría"
                description="Ajusta el rango de fechas, la acción o la entidad para ampliar la búsqueda."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[58rem] text-left text-xs">
                  <thead className="border-b border-line bg-paper/60 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">Acción</th>
                      <th className="px-4 py-3">Entidad</th>
                      <th className="px-4 py-3">Registro</th>
                      <th className="px-4 py-3 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {filteredAudit.slice(0, 300).map((entry) => (
                      <tr key={entry.id} className="transition hover:bg-paper/40">
                        <td className="px-4 py-2.5">
                          <p className="font-bold text-ink">{formatDate(entry.created_at)}</p>
                          <p className="text-[9px] text-muted">{formatDateTime(entry.created_at).split(" · ")[1]}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-ink">{entry.actor_name ?? entry.actor_email ?? "Sistema"}</p>
                          <p className="text-[9px] text-muted">{entry.actor_role ? ROLE_LABELS[entry.actor_role] : "Automático"}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={entry.action === "delete" ? "danger" : entry.action === "update" ? "warning" : "default"}>
                            {ACTION_LABELS[entry.action] ?? entry.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-muted">{entry.entity}</td>
                        <td className="max-w-[12rem] truncate px-4 py-2.5 font-mono text-[9px] text-muted">{entry.entity_id ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button variant="ghost" size="sm" icon={<Eye className="size-3.5" />} onClick={() => setAuditDetail(entry)}>
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredAudit.length > 300 ? (
                  <p className="border-t border-line px-4 py-2.5 text-[10px] text-muted">
                    Mostrando los 300 registros más recientes de {filteredAudit.length}. Exporta el CSV para ver el detalle completo.
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "dispositivos" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Cajas y dispositivos autorizados</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted">
                  El token se muestra una sola vez. El servidor conserva únicamente su hash SHA-256.
                </p>
              </div>
              {isAdmin ? <Button size="sm" icon={<Plus className="size-3.5" />} onClick={openDevice}>Registrar</Button> : null}
            </CardHeader>
            <CardContent className="p-0">
              {devices.length === 0 ? (
                <EmptyState
                  icon={<MonitorSmartphone className="size-5" />}
                  title="Aún no hay dispositivos registrados"
                  description={
                    isAdmin
                      ? "Registra la caja o tablet de cada sede para trazabilidad y revocación inmediata."
                      : "Un administrador puede registrar las cajas autorizadas."
                  }
                  action={isAdmin ? <Button size="sm" onClick={openDevice}>Registrar el primero</Button> : undefined}
                />
              ) : (
                <div className="divide-y divide-line/70">
                  {devices.map((device) => (
                    <div key={device.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${device.status === "activo" ? "bg-brand-50 text-brand-700" : "bg-paper-deep text-muted"}`}>
                        {device.name.toLowerCase().includes("tablet") || device.name.toLowerCase().includes("móvil") ? (
                          <Smartphone className="size-4" />
                        ) : (
                          <Laptop className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-xs font-bold text-ink">{device.name}</p>
                          <Badge variant={device.status === "activo" ? "success" : "muted"}>
                            {device.status === "activo" ? "Activo" : "Revocado"}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {device.sites?.name ?? "Sede"} · {device.last_seen_at ? `Última conexión ${relativeTime(device.last_seen_at)}` : "Sin actividad"} ·
                          {" "}Registrado {formatDate(device.created_at)}
                        </p>
                      </div>
                      {isAdmin && device.status === "activo" ? (
                        <Button variant="dangerSoft" size="sm" icon={<Power className="size-3.5" />} onClick={() => setRevoking(device)}>
                          Revocar
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Controles del dispositivo</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted">Higiene operativa</p>
              </div>
              <Lock className="size-4 text-brand-600" />
            </CardHeader>
            <CardContent className="space-y-3 text-[10px] leading-relaxed text-muted">
              <div className="rounded-xl border border-line bg-paper/40 px-3 py-2.5">
                <p className="font-bold text-ink">Token de un solo uso visual</p>
                <p className="mt-0.5">Cópialo al gestor de secretos de la caja. Si se pierde, revoca el dispositivo y registra uno nuevo.</p>
              </div>
              <div className="rounded-xl border border-line bg-paper/40 px-3 py-2.5">
                <p className="font-bold text-ink">Revocación inmediata</p>
                <p className="mt-0.5">Al revocar, la caja pierde autorización en el siguiente intento de validación.</p>
              </div>
              <div className="rounded-xl border border-line bg-paper/40 px-3 py-2.5">
                <p className="font-bold text-ink">Trazabilidad</p>
                <p className="mt-0.5">Cada registro y revocación genera un evento de dispositivo con actor y fecha.</p>
              </div>
              <div className="rounded-xl bg-brand-50 px-3 py-2.5 text-brand-800">
                <p className="inline-flex items-center gap-1.5 font-bold"><ShieldCheck className="size-3.5" /> Requisito del piloto</p>
                <p className="mt-0.5">Activa «Exigir dispositivo registrado» en Configuración antes de producción.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "mfa" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Segundo factor (TOTP)</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted">
                  Protege tu cuenta con una aplicación autenticadora. Obligatorio para administradores y supervisores en producción.
                </p>
              </div>
              <KeyRound className="size-4 text-brand-600" />
            </CardHeader>
            <CardContent className="space-y-4">
              {mfaError ? <Alert variant="danger">{mfaError}</Alert> : null}

              {mfaLoading ? (
                <Skeleton className="h-24" />
              ) : factors.length > 0 ? (
                <div className="space-y-2">
                  {factors.map((factor) => (
                    <div key={factor.id} className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                        <CheckCircle2 className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-ink">{factor.friendly_name ?? "Aplicación autenticadora"}</p>
                        <p className="text-[9px] text-muted">
                          Verificado {factor.created_at ? formatDate(factor.created_at) : ""} · TOTP de 6 dígitos
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" icon={<XCircle className="size-3.5" />} onClick={() => void removeFactor(factor)} loading={mfaBusy}>
                        Eliminar
                      </Button>
                    </div>
                  ))}
                </div>
              ) : mfaEnrollment ? (
                <div className="grid gap-4 sm:grid-cols-[auto,1fr]">
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-2xl border border-line bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mfaEnrollment.qrCode} alt="Código QR para configurar el segundo factor" className="size-44" />
                    </div>
                    <p className="text-center text-[9px] text-muted">Escanea con Google Authenticator, Authy o 1Password.</p>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-line bg-paper/40 px-3 py-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Clave manual</p>
                      <p className="mt-1 break-all font-mono text-[11px] font-bold text-ink">{mfaEnrollment.secret}</p>
                    </div>
                    <Field label="Código de 6 dígitos *" hint="Ingresa el código que muestra tu aplicación.">
                      <Input
                        inputMode="numeric"
                        maxLength={6}
                        value={mfaCode}
                        onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}
                        placeholder="••••••"
                        className="text-center font-mono text-lg tracking-[0.4em]"
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button onClick={() => void confirmMfaEnrollment()} loading={mfaBusy} icon={<ShieldCheck className="size-4" />}>
                        Confirmar y activar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setMfaEnrollment(null);
                          setMfaCode("");
                          setMfaError(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-paper/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-citrus-100 text-[#8a6110]">
                      <ShieldAlert className="size-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-ink">Tu cuenta no tiene segundo factor</p>
                      <p className="mt-0.5 max-w-md text-[10px] leading-relaxed text-muted">
                        Un solo factor es insuficiente para cuentas con acceso a datos de empleados, tiquetes y reportes.
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => void startMfaEnrollment()} loading={mfaBusy} icon={<KeyRound className="size-4" />}>
                    Activar MFA
                  </Button>
                </div>
              )}

              <div className="rounded-xl border border-line bg-white px-3.5 py-3">
                <p className="text-[11px] font-bold text-ink">Cuentas privilegiadas sin MFA</p>
                {privilegedWithoutMfa.length === 0 ? (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-[10px] text-brand-700">
                    <CheckCircle2 className="size-3.5" /> Todas las cuentas administrativas y de supervisión están protegidas.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {privilegedWithoutMfa.map((item) => (
                      <Badge key={item.id} variant="warning">
                        {item.full_name ?? item.email ?? "Usuario"} · {ROLE_LABELS[item.role]}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Privacidad y consentimiento</CardTitle>
                  <p className="mt-0.5 text-[11px] text-muted">Ley 1581 de Colombia</p>
                </div>
                <Fingerprint className="size-4 text-brand-600" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[10px]">
                    <span className="font-bold text-muted">Empleados con consentimiento</span>
                    <span className="font-extrabold text-ink">{counts.consentsGranted}/{counts.employees}</span>
                  </div>
                  <ProgressBar value={consentPercent} tone={consentPercent >= 90 ? "brand" : "citrus"} />
                  <p className="mt-1.5 text-[9px] text-muted">
                    El consentimiento es obligatorio para tratar datos personales y biometría.
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-paper/50 px-3 py-2.5 text-[11px]">
                  <span className="text-muted">Credenciales biométricas activas</span>
                  <strong className="text-ink">{counts.biometricsActive}</strong>
                </div>
                <p className="text-[9px] leading-relaxed text-muted">
                  Solo se guardan credenciales WebAuthn revocables. Nunca se almacenan imágenes de huellas ni plantillas biométricas.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Controles verificados</CardTitle>
                  <p className="mt-0.5 text-[11px] text-muted">Base del piloto</p>
                </div>
                <ClipboardCheck className="size-4 text-brand-600" />
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  <CheckItem>RLS activo en todas las tablas con exposición pública.</CheckItem>
                  <CheckItem>Eventos y auditoría de solo lectura para auditar; sin borrado ni edición.</CheckItem>
                  <CheckItem>QR firmado con HMAC-SHA256, nonce de un solo uso y TTL de 45 segundos.</CheckItem>
                  <CheckItem>Service role confinado a Edge Functions; nunca en el navegador.</CheckItem>
                  <CheckItem>Consentimientos, biometría y datos personales minimizados.</CheckItem>
                  <CheckItem>Dispositivos con token opaco, hash en servidor y revocación inmediata.</CheckItem>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-brand-950 text-white">
              <CardContent className="p-4">
                <Lock className="size-4 text-citrus-300" />
                <p className="mt-2 text-xs font-bold">Sesiones y acceso</p>
                <p className="mt-1 text-[10px] leading-relaxed text-brand-100/70">
                  Las sesiones expiran y se renuevan automáticamente. Para producción: MFA obligatorio, rotación de secretos,
                  backups con PITR y pentest externo antes del lanzamiento.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(auditDetail)}
        onClose={() => setAuditDetail(null)}
        title="Detalle de auditoría"
        description="El registro es inmutable. Los cambios se conservan con su valor anterior y nuevo."
        size="lg"
        footer={<Button variant="secondary" onClick={() => setAuditDetail(null)}>Cerrar</Button>}
      >
        {auditDetail ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                ["Fecha", formatDateTime(auditDetail.created_at)],
                ["Usuario", auditDetail.actor_name ?? auditDetail.actor_email ?? "Sistema"],
                ["Rol", auditDetail.actor_role ? ROLE_LABELS[auditDetail.actor_role] : "Automático"],
                ["Acción", ACTION_LABELS[auditDetail.action] ?? auditDetail.action],
                ["Entidad", auditDetail.entity],
                ["Registro", auditDetail.entity_id ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line/80 bg-white px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-muted">{label}</p>
                  <p className="mt-0.5 break-all font-semibold text-ink">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-ink"><FileText className="size-3.5" /> Datos anteriores</p>
                <pre className="max-h-64 overflow-auto rounded-xl border border-line bg-paper/50 px-3 py-2.5 text-[9px] leading-relaxed text-muted">
                  {auditDetail.old_data ? JSON.stringify(auditDetail.old_data, null, 2) : "Sin datos anteriores"}
                </pre>
              </div>
              <div>
                <p className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-ink"><Database className="size-3.5" /> Datos nuevos</p>
                <pre className="max-h-64 overflow-auto rounded-xl border border-line bg-paper/50 px-3 py-2.5 text-[9px] leading-relaxed text-muted">
                  {auditDetail.new_data ? JSON.stringify(auditDetail.new_data, null, 2) : "Sin datos nuevos"}
                </pre>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-citrus-100/50 px-3 py-2.5 text-[10px] leading-relaxed text-[#7a5a12]">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              <span>ID de auditoría {auditDetail.id}. Este registro no se puede editar ni eliminar; cualquier corrección genera un nuevo evento.</span>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={deviceModal}
        onClose={() => {
          setDeviceModal(false);
          setIssuedToken(null);
        }}
        title={issuedToken ? "Guarda el token del dispositivo" : "Registrar dispositivo"}
        description={
          issuedToken
            ? "Esta es la única vez que verás el token. Guárdalo en la caja antes de cerrar."
            : "La caja recibirá un token opaco. El servidor solo almacena su hash."
        }
        size="md"
        footer={
          issuedToken ? (
            <>
              <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => void copyToken()}>Copiar token</Button>
              <Button
                onClick={() => {
                  setDeviceModal(false);
                  setIssuedToken(null);
                }}
              >
                Entendido
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setDeviceModal(false)}>Cancelar</Button>
              <Button onClick={() => void registerDevice()} loading={savingDevice} icon={<MonitorSmartphone className="size-4" />}>
                Registrar dispositivo
              </Button>
            </>
          )
        }
      >
        {deviceError ? <Alert variant="danger" className="mb-4">{deviceError}</Alert> : null}
        {issuedToken ? (
          <div className="space-y-4">
            <Alert variant="warning" title="Token visible una sola vez">
              Cópialo ahora. Si lo pierdes, deberás revocar este dispositivo y registrar uno nuevo.
            </Alert>
            <div className="rounded-xl border border-line bg-paper/50 px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Dispositivo</p>
              <p className="mt-0.5 text-xs font-bold text-ink">{issuedToken.name}</p>
              <p className="mt-3 text-[9px] font-bold uppercase tracking-wide text-muted">Token</p>
              <p className="mt-1 break-all rounded-lg bg-brand-950 px-3 py-2 font-mono text-[10px] leading-relaxed text-citrus-300">
                {issuedToken.token}
              </p>
            </div>
            <p className="text-[10px] leading-relaxed text-muted">
              El token se usa para identificar la caja en la validación. No lo compartas por correo ni lo guardes en el repositorio.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Nombre del dispositivo *" hint="Ej. Caja principal Sede Central, Tablet cafetería.">
              <Input
                value={deviceForm.name}
                onChange={(event) => setDeviceForm({ ...deviceForm, name: event.target.value })}
                placeholder="Caja principal Sede Central"
              />
            </Field>
            <Field label="Sede *">
              <Select value={deviceForm.site_id} onChange={(event) => setDeviceForm({ ...deviceForm, site_id: event.target.value })}>
                <option value="">Selecciona una sede</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </Select>
            </Field>
            <div className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[10px] leading-relaxed text-brand-800">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              <span>El registro queda auditado con tu usuario. La caja podrá revocarse en cualquier momento desde esta pantalla.</span>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        title="Revocar dispositivo"
        description="La caja perderá autorización de forma inmediata. Esta acción queda auditada."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevoking(null)}>Cancelar</Button>
            <Button variant="danger" loading={revokeBusy} onClick={() => void revokeDevice()} icon={<Power className="size-4" />}>
              Revocar dispositivo
            </Button>
          </>
        }
      >
        {revoking ? (
          <Alert variant="warning" title="Vas a revocar esta caja">
            {revoking.name} · {revoking.sites?.name ?? "Sede"}. Si la caja sigue en operación, no podrá validar consumos hasta que registres un reemplazo.
          </Alert>
        ) : null}
      </Modal>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-[10px] leading-relaxed text-muted">
        <UserCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <span>
          La auditoría es append-only: los roles administrador y auditor pueden leerla, pero nadie puede modificarla ni eliminarla desde la aplicación.
          Las compensaciones y resoluciones agregan eventos nuevos en lugar de borrar evidencia.
        </span>
      </div>
    </div>
  );
}
