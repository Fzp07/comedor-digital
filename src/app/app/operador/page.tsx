"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  CloudOff,
  Clock3,
  Fingerprint,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  UserCheck,
  WifiOff,
} from "lucide-react";
import { RoleGate } from "@/components/app-shell";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  Textarea,
} from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { supabase } from "@/lib/supabase";
import type { MealType, ServiceWindow, ValidationResult } from "@/lib/types";
import { formatTime, MEAL_LABELS, METHOD_LABELS, mealWindowStatus, relativeTime, todayISO } from "@/lib/utils";
import {
  listPendingValidations,
  markQueued,
  queueOfflineValidation,
  readQueuedToken,
  type QueuedValidation,
} from "@/lib/offline-db";

interface RecentRow {
  id: string;
  employee_name: string;
  employee_code: string;
  photo_url: string | null;
  meal_type: MealType;
  method: string;
  redeemed_at: string;
  offline: boolean;
  status: string;
  site_name: string;
}

type FunctionPayload = { ok?: boolean; message?: string } & Record<string, unknown>;

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function readBarcodeDetector(): BarcodeDetectorConstructor | null {
  const candidate = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  return candidate ?? null;
}

function isResponse(value: unknown): value is Response {
  return typeof value === "object" && value !== null && "json" in value && "status" in value;
}

const DEVICE_TOKEN_KEY = "comedor_device_token";

function readDeviceToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(DEVICE_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

async function callFunction(name: string, body: Record<string, unknown>): Promise<{
  data: FunctionPayload | null;
  network: boolean;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.functions.invoke(name, {
      body: { ...body, device_token: readDeviceToken() },
    });
    if (error) {
      const context = (error as { context?: unknown }).context;
      if (isResponse(context)) {
        try {
          const parsed = (await context.json()) as FunctionPayload;
          return { data: parsed, network: false, error: parsed.message ?? error.message };
        } catch {
          return { data: null, network: false, error: error.message };
        }
      }
      return { data: null, network: true, error: error.message };
    }
    return { data: (data ?? null) as FunctionPayload | null, network: false, error: null };
  } catch (invokeError) {
    return {
      data: null,
      network: true,
      error: invokeError instanceof Error ? invokeError.message : "No pudimos contactar el servidor.",
    };
  }
}

function decodeMealFromToken(token: string): MealType {
  try {
    const payload = token.split(".")[0];
    if (!payload) return "almuerzo";
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as { m?: string };
    return parsed.m === "merienda" ? "merienda" : "almuerzo";
  } catch {
    return "almuerzo";
  }
}

export default function OperatorPage() {
  return (
    <RoleGate roles={["admin", "operador", "supervisor"]}>
      <OperatorContent />
    </RoleGate>
  );
}

function OperatorContent() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState("qr");
  const [meal, setMeal] = useState<MealType>("almuerzo");
  const [windows, setWindows] = useState<ServiceWindow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const [result, setResult] = useState<ValidationResult | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "danger" | "warning" | "success"; message: string } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [processing, setProcessing] = useState(false);

  const [pinCode, setPinCode] = useState("");
  const [pinValue, setPinValue] = useState("");

  const [overrideCode, setOverrideCode] = useState("");
  const [overrideEmail, setOverrideEmail] = useState("supervisor@comedordigital.co");
  const [overridePin, setOverridePin] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const [pending, setPending] = useState<QueuedValidation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [allowOffline, setAllowOffline] = useState(true);
  const [deviceModal, setDeviceModal] = useState(false);
  const [deviceTokenInput, setDeviceTokenInput] = useState("");
  const [hasDeviceToken, setHasDeviceToken] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const processingRef = useRef(false);

  const lunchStatus = useMemo(() => mealWindowStatus(windows, "almuerzo"), [windows]);
  const snackStatus = useMemo(() => mealWindowStatus(windows, "merienda"), [windows]);
  const currentStatus = meal === "almuerzo" ? lunchStatus : snackStatus;

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    const date = todayISO();
    const [detail, count] = await Promise.all([
      supabase
        .from("v_redemption_detail")
        .select("id,employee_name,employee_code,photo_url,meal_type,method,redeemed_at,offline,status,site_name")
        .eq("redemption_date", date)
        .order("redeemed_at", { ascending: false })
        .limit(14),
      supabase
        .from("v_redemption_detail")
        .select("id", { count: "exact", head: true })
        .eq("redemption_date", date),
    ]);
    setRecent((detail.data ?? []) as RecentRow[]);
    setTodayTotal(count.count ?? 0);
    setLoadingRecent(false);
  }, []);

  const refreshPending = useCallback(async () => {
    setPending(await listPendingValidations());
  }, []);

  const loadContext = useCallback(async () => {
    const [{ data: windowData }, { data: settings }] = await Promise.all([
      supabase.from("service_windows").select("*").eq("active", true),
      supabase.from("company_settings").select("allow_offline").eq("id", true).maybeSingle(),
    ]);
    setWindows((windowData ?? []) as ServiceWindow[]);
    setAllowOffline(settings?.allow_offline !== false);
  }, []);

  useEffect(() => {
    void loadContext();
    void loadRecent();
    void refreshPending();
  }, [loadContext, loadRecent, refreshPending]);

  useEffect(() => {
    setHasDeviceToken(Boolean(readDeviceToken()));
  }, []);

  useEffect(() => {
    if (windows.length === 0) return;
    const lunch = mealWindowStatus(windows, "almuerzo");
    const snack = mealWindowStatus(windows, "merienda");
    if (!lunch.open && snack.open) setMeal("merienda");
  }, [windows]);

  useEffect(() => {
    const channel = supabase
      .channel("operator-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "redemptions" }, () => void loadRecent())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadRecent]);

  function stopScanner() {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    detectorRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }

  useEffect(() => {
    return () => {
      if (scanTimerRef.current !== null) window.clearInterval(scanTimerRef.current);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
      }
    };
  }, []);

  async function startScanner() {
    setCameraError(null);
    setFeedback(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Tu navegador no permite acceder a la cámara. Usa el campo de código manual.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const Detector = readBarcodeDetector();
      if (!Detector) {
        setCameraError("Este navegador no soporta lectura automática de QR. Puedes pegar el código manualmente.");
        return;
      }
      detectorRef.current = new Detector({ formats: ["qr_code"] });
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || processingRef.current || !detectorRef.current) return;
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          const value = codes[0]?.rawValue?.trim();
          if (!value) return;
          processingRef.current = true;
          stopScanner();
          await validateQr(value);
        } catch {
          // el frame puede fallar mientras la cámara se estabiliza
        } finally {
          processingRef.current = false;
        }
      }, 550);
    } catch (permissionError) {
      setScanning(false);
      setCameraError(
        permissionError instanceof Error && permissionError.name === "NotAllowedError"
          ? "Permiso de cámara denegado. Habilítalo en el navegador o usa el código manual."
          : "No pudimos abrir la cámara. Verifica que no esté siendo usada por otra aplicación.",
      );
    }
  }

  async function validateQr(token: string) {
    const clean = token.trim();
    if (!clean) {
      setFeedback({ tone: "warning", message: "Pega el código QR o activa la cámara." });
      return;
    }
    setProcessing(true);
    setFeedback(null);
    setResult(null);
    const response = await callFunction("validate-qr", { token: clean });
    setProcessing(false);

    if (response.network) {
      if (!allowOffline) {
        setFeedback({ tone: "danger", message: "Sin conexión y el modo offline está deshabilitado." });
        return;
      }
      try {
        const mealType = decodeMealFromToken(clean);
        await queueOfflineValidation({
          token: clean,
          meal_type: mealType,
          method: "qr",
          idempotency_key: crypto.randomUUID(),
        });
        await refreshPending();
        setFeedback({
          tone: "warning",
          message: "Sin conexión: el consumo quedó guardado de forma cifrada y se sincronizará cuando vuelva la red.",
        });
        setTokenInput("");
      } catch {
        setFeedback({ tone: "danger", message: "No pudimos guardar el consumo offline en este dispositivo." });
      }
      return;
    }

    const payload = response.data as (ValidationResult & FunctionPayload) | null;
    if (!payload || payload.ok === false) {
      setFeedback({
        tone: "danger",
        message: payload?.message ?? response.error ?? "No fue posible validar el código.",
      });
      return;
    }
    setResult(payload as ValidationResult);
    setTokenInput("");
    setPinCode("");
    setPinValue("");
    void loadRecent();
    toast({
      title: "Consumo validado",
      description: `${payload.employee?.full_name ?? "Empleado"} · ${payload.meal_type ? MEAL_LABELS[payload.meal_type] : ""}`,
      variant: "success",
    });
  }

  async function validatePin() {
    if (!pinCode.trim() || !/^\d{4,6}$/.test(pinValue)) {
      setFeedback({ tone: "warning", message: "Ingresa el código del empleado y un PIN de 4 a 6 dígitos." });
      return;
    }
    setProcessing(true);
    setFeedback(null);
    setResult(null);
    const response = await callFunction("validate-pin", {
      employee_code: pinCode.trim(),
      pin: pinValue.trim(),
      meal_type: meal,
    });
    setProcessing(false);
    const payload = response.data as (ValidationResult & FunctionPayload) | null;
    if (response.network) {
      setFeedback({ tone: "danger", message: "El PIN requiere conexión a internet. Intenta de nuevo cuando vuelva la red." });
      return;
    }
    if (!payload || payload.ok === false) {
      setFeedback({ tone: "danger", message: payload?.message ?? response.error ?? "PIN incorrecto." });
      return;
    }
    setResult(payload as ValidationResult);
    setPinCode("");
    setPinValue("");
    void loadRecent();
  }

  async function validateOverride() {
    if (!overrideCode.trim()) {
      setFeedback({ tone: "warning", message: "Ingresa el código del empleado." });
      return;
    }
    if (!overrideEmail.trim() || !overridePin.trim()) {
      setFeedback({ tone: "warning", message: "Ingresa el correo y el PIN del supervisor." });
      return;
    }
    if (overrideReason.trim().length < 10) {
      setFeedback({ tone: "warning", message: "Describe el motivo de la excepción (mínimo 10 caracteres)." });
      return;
    }
    setProcessing(true);
    setFeedback(null);
    setResult(null);
    const response = await callFunction("validate-override", {
      employee_code: overrideCode.trim(),
      meal_type: meal,
      supervisor_email: overrideEmail.trim(),
      supervisor_pin: overridePin.trim(),
      reason: overrideReason.trim(),
    });
    setProcessing(false);
    const payload = response.data as (ValidationResult & FunctionPayload) | null;
    if (response.network) {
      setFeedback({ tone: "danger", message: "La excepción requiere conexión a internet." });
      return;
    }
    if (!payload || payload.ok === false) {
      setFeedback({ tone: "danger", message: payload?.message ?? response.error ?? "No fue posible autorizar la excepción." });
      return;
    }
    setResult(payload as ValidationResult);
    setOverrideCode("");
    setOverridePin("");
    setOverrideReason("");
    void loadRecent();
    toast({ title: "Excepción autorizada", description: "El consumo quedó registrado con doble control.", variant: "warning" });
  }

  async function syncQueue() {
    if (pending.length === 0) return;
    setSyncing(true);
    try {
      const items = [];
      for (const item of pending) {
        items.push({
          token: await readQueuedToken(item),
          idempotency_key: item.idempotency_key,
          meal_type: item.meal_type,
        });
      }
      const response = await callFunction("sync-offline", { items });
      const payload = response.data as
        | { ok?: boolean; synced?: number; failed?: number; results?: Array<{ idempotency_key: string; ok: boolean; message?: string }>; message?: string }
        | null;
      if (response.network || !payload?.ok) {
        toast({
          title: "No pudimos sincronizar",
          description: payload?.message ?? response.error ?? "Revisa la conexión e intenta de nuevo.",
          variant: "error",
        });
        return;
      }
      const resultMap = new Map((payload.results ?? []).map((entry) => [entry.idempotency_key, entry]));
      for (const item of pending) {
        if (item.id === undefined) continue;
        const entry = resultMap.get(item.idempotency_key);
        if (entry?.ok) await markQueued(item.id, "sincronizado");
        else await markQueued(item.id, "error", entry?.message ?? "Sin respuesta del servidor");
      }
      toast({
        title: "Sincronización completada",
        description: `${payload.synced ?? 0} consumos sincronizados · ${payload.failed ?? 0} con error.`,
        variant: payload.failed ? "warning" : "success",
      });
      await Promise.all([refreshPending(), loadRecent()]);
    } finally {
      setSyncing(false);
    }
  }

  function resetResult() {
    setResult(null);
    setFeedback(null);
    if (tab === "qr") {
      setTokenInput("");
    }
  }

  function openDeviceModal() {
    setDeviceTokenInput(readDeviceToken());
    setDeviceModal(true);
  }

  function saveDeviceToken() {
    const value = deviceTokenInput.trim();
    if (value.length < 20) {
      toast({
        title: "Token demasiado corto",
        description: "Pega el token completo que entrega el administrador al registrar la caja.",
        variant: "warning",
      });
      return;
    }
    try {
      window.localStorage.setItem(DEVICE_TOKEN_KEY, value);
      setHasDeviceToken(true);
      setDeviceModal(false);
      toast({
        title: "Caja configurada",
        description: "Las validaciones de este navegador se asociarán al dispositivo autorizado.",
        variant: "success",
      });
    } catch {
      toast({ title: "No pudimos guardar el token", description: "Revisa el almacenamiento del navegador.", variant: "error" });
    }
  }

  function clearDeviceToken() {
    try {
      window.localStorage.removeItem(DEVICE_TOKEN_KEY);
      setDeviceTokenInput("");
      setHasDeviceToken(false);
      toast({ title: "Token eliminado", description: "Esta caja validará sin dispositivo asociado hasta configurar uno nuevo.", variant: "info" });
    } catch {
      toast({ title: "No pudimos eliminar el token", description: "Revisa el almacenamiento del navegador.", variant: "error" });
    }
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={`${profile?.role === "operador" ? "Estación de caja" : "Supervisión"} · ${formatTime(new Date())}`}
        title="Validar comedor"
        description="Escanea el QR dinámico, valida el PIN de respaldo o autoriza una excepción con doble control. Cada consumo se registra una sola vez."
        actions={
          <>
            {pending.length > 0 ? (
              <Button variant="secondary" icon={<CloudOff className="size-4" />} onClick={() => void syncQueue()} loading={syncing}>
                Sincronizar {pending.length}
              </Button>
            ) : null}
            <Badge variant={currentStatus.open ? "success" : "muted"} className="h-9 px-3">
              <Clock3 className="size-3.5" />
              {meal === "almuerzo" ? "Almuerzo" : "Merienda"} {currentStatus.open ? "abierto" : "cerrado"}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={openDeviceModal}
              aria-label="Configurar caja autorizada"
              title={hasDeviceToken ? "Caja autorizada configurada" : "Configurar token de caja"}
            >
              <MonitorSmartphone className={hasDeviceToken ? "size-4 text-brand-600" : "size-4 text-muted"} />
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Consumos hoy" value={todayTotal} hint="En tu sede asignada" icon={<UserCheck className="size-5" />} />
        <StatCard
          label="Almuerzo"
          value={lunchStatus.open ? "Abierto" : "Cerrado"}
          hint={lunchStatus.label}
          icon={<Clock3 className="size-5" />}
          tone={lunchStatus.open ? "brand" : "clay"}
        />
        <StatCard
          label="Merienda"
          value={snackStatus.open ? "Abierto" : "Cerrado"}
          hint={snackStatus.label}
          icon={<Clock3 className="size-5" />}
          tone={snackStatus.open ? "citrus" : "clay"}
        />
        <StatCard
          label="Cola offline"
          value={pending.length}
          hint={pending.length > 0 ? "Pendientes por sincronizar" : "Todo sincronizado"}
          icon={pending.length > 0 ? <WifiOff className="size-5" /> : <ShieldCheck className="size-5" />}
          tone={pending.length > 0 ? "citrus" : "sky"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <CardTitle>Punto de validación</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">Un consumo por empleado, comida y día. El servidor aplica la regla de forma atómica.</p>
            </div>
            <Select value={meal} onChange={(event) => setMeal(event.target.value as MealType)} className="sm:w-40">
              <option value="almuerzo">Almuerzo</option>
              <option value="merienda">Merienda</option>
            </Select>
          </CardHeader>

          <CardContent className="space-y-4">
            {result ? (
              <div className={`rounded-2xl border-2 p-4 ${result.override ? "border-citrus-400 bg-citrus-100/40" : "border-brand-400 bg-brand-50"}`}>
                <div className="flex items-start gap-3">
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${result.override ? "bg-citrus-400/30 text-[#7a5a12]" : "bg-brand-600 text-white"}`}>
                    <CheckCircle2 className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-extrabold text-ink">{result.employee?.full_name ?? "Consumo registrado"}</p>
                      <Badge variant={result.override ? "warning" : "success"}>{result.override ? "Excepción" : "Válido"}</Badge>
                      {result.offline ? <Badge variant="warning">Offline</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {result.employee?.code} · {result.site ?? "Sede"} · {result.meal_type ? MEAL_LABELS[result.meal_type] : ""}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                      <div className="rounded-lg bg-white/70 px-2.5 py-2">
                        <p className="font-bold uppercase tracking-wide text-muted">Método</p>
                        <p className="mt-0.5 font-bold text-ink">{result.method ? METHOD_LABELS[result.method] : "—"}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 px-2.5 py-2">
                        <p className="font-bold uppercase tracking-wide text-muted">Hora</p>
                        <p className="mt-0.5 font-bold text-ink">{result.redeemed_at ? formatTime(result.redeemed_at) : formatTime(new Date())}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 px-2.5 py-2">
                        <p className="font-bold uppercase tracking-wide text-muted">Plan</p>
                        <p className="mt-0.5 font-bold text-ink">{result.plan ?? "—"}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 px-2.5 py-2">
                        <p className="font-bold uppercase tracking-wide text-muted">Tiquete</p>
                        <p className="mt-0.5 truncate font-bold text-ink">{result.ticket_code ?? "Consumo directo"}</p>
                      </div>
                    </div>
                  </div>
                  <Avatar name={result.employee?.full_name} src={result.employee?.photo_url} size="lg" className="hidden sm:inline-flex" />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="secondary" onClick={resetResult} icon={<ScanLine className="size-4" />}>Siguiente empleado</Button>
                </div>
              </div>
            ) : null}

            {feedback ? (
              <Alert variant={feedback.tone === "success" ? "success" : feedback.tone === "warning" ? "warning" : "danger"}>
                {feedback.message}
              </Alert>
            ) : null}

            <Tabs
              tabs={[
                { value: "qr", label: "QR dinámico" },
                { value: "pin", label: "PIN de respaldo" },
                { value: "override", label: "Excepción" },
              ]}
              value={tab}
              onChange={(value) => {
                stopScanner();
                setFeedback(null);
                setTab(value);
              }}
            />

            {tab === "qr" ? (
              <div className="space-y-4">
                <div className="relative overflow-hidden rounded-2xl border border-line bg-brand-950">
                  <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover sm:aspect-video" />
                  {!scanning ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-brand-950/95 px-6 text-center">
                      <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-citrus-300">
                        <QrCode className="size-7" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-white">Escanea el QR del empleado</p>
                        <p className="mt-1 max-w-sm text-[10px] leading-relaxed text-brand-100/70">
                          El código rota cada 45 segundos y solo puede usarse una vez. También puedes pegar el token manualmente.
                        </p>
                      </div>
                      <Button variant="outline" icon={<Camera className="size-4" />} onClick={() => void startScanner()}>
                        Activar cámara
                      </Button>
                    </div>
                  ) : (
                    <div className="pointer-events-none absolute inset-0">
                      <div className="absolute inset-8 rounded-2xl border-2 border-citrus-300/90 shadow-[0_0_0_9999px_rgba(8,42,36,0.45)]" />
                      <div className="absolute inset-x-0 top-1/2 h-0.5 animate-pulse bg-citrus-300/80" />
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-950/80 px-3 py-1 text-[10px] font-bold text-white">
                        Apunta al QR del empleado
                      </div>
                    </div>
                  )}
                  {scanning ? (
                    <button
                      type="button"
                      onClick={stopScanner}
                      className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-brand-950/80 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur"
                    >
                      <CameraOff className="size-3.5" /> Detener
                    </button>
                  ) : null}
                </div>

                {cameraError ? <Alert variant="warning">{cameraError}</Alert> : null}

                <div className="rounded-2xl border border-line bg-paper/40 p-3.5">
                  <p className="text-[11px] font-bold text-ink">Código manual</p>
                  <p className="mt-0.5 text-[10px] text-muted">Pega el contenido del QR si la cámara no está disponible.</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={tokenInput}
                      onChange={(event) => setTokenInput(event.target.value)}
                      placeholder="eyJ2IjoxLCJlIjoi…"
                      className="flex-1 font-mono text-[10px]"
                    />
                    <Button onClick={() => void validateQr(tokenInput)} loading={processing} icon={<ScanLine className="size-4" />}>
                      Validar
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "pin" ? (
              <div className="rounded-2xl border border-line bg-paper/40 p-4">
                <div className="flex items-start gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                    <KeyRound className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-ink">PIN de respaldo</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                      Úsalo cuando el empleado no pueda generar el QR: cámara sin batería, pantalla dañada o conectividad limitada.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Código o documento del empleado *">
                    <Input value={pinCode} onChange={(event) => setPinCode(event.target.value)} placeholder="EMP-001" />
                  </Field>
                  <Field label="PIN de comedor *" hint="4 a 6 dígitos. Nunca se muestra en pantalla.">
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={pinValue}
                      onChange={(event) => setPinValue(event.target.value.replace(/\D/g, ""))}
                      placeholder="••••"
                    />
                  </Field>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-[10px] text-muted">La regla de un consumo por comida y día también aplica al PIN.</p>
                  <Button onClick={() => void validatePin()} loading={processing} icon={<KeyRound className="size-4" />}>Validar PIN</Button>
                </div>
              </div>
            ) : null}

            {tab === "override" ? (
              <div className="rounded-2xl border border-citrus-200 bg-citrus-100/30 p-4">
                <div className="flex items-start gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-citrus-400/30 text-[#7a5a12]">
                    <AlertTriangle className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[#6d4e0d]">Excepción con doble control</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-[#8a6110]">
                      El supervisor autoriza con su correo y PIN. Queda registrado el motivo, quién solicitó y quién autorizó.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Código o documento del empleado *">
                    <Input value={overrideCode} onChange={(event) => setOverrideCode(event.target.value)} placeholder="EMP-001" />
                  </Field>
                  <Field label="Correo del supervisor *">
                    <Input type="email" value={overrideEmail} onChange={(event) => setOverrideEmail(event.target.value)} placeholder="supervisor@comedordigital.co" />
                  </Field>
                  <Field label="PIN del supervisor *">
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={overridePin}
                      onChange={(event) => setOverridePin(event.target.value.replace(/\D/g, ""))}
                      placeholder="••••"
                    />
                  </Field>
                  <Field label="Comida *">
                    <Select value={meal} onChange={(event) => setMeal(event.target.value as MealType)}>
                      <option value="almuerzo">Almuerzo</option>
                      <option value="merienda">Merienda</option>
                    </Select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Motivo de la excepción *" hint="Mínimo 10 caracteres. Se conserva en la auditoría.">
                      <Textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Ej. el empleado no pudo generar el QR por falla del dispositivo, se verificó su documento." />
                    </Field>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-[10px] text-muted">Límite diario: 3 excepciones por sede (configurable).</p>
                  <Button variant="dark" onClick={() => void validateOverride()} loading={processing} icon={<ShieldCheck className="size-4" />}>
                    Autorizar excepción
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Últimos consumos</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted">Hoy en tu sede</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void loadRecent()} aria-label="Recargar">
                <RefreshCw className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loadingRecent ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="size-5 animate-spin text-brand-600" /></div>
              ) : recent.length === 0 ? (
                <EmptyState icon={<ScanLine className="size-5" />} title="Sin consumos todavía" description="El primer QR validado aparecerá aquí al instante." />
              ) : (
                <div className="divide-y divide-line/70">
                  {recent.map((item) => (
                    <div key={item.id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <Avatar name={item.employee_name} src={item.photo_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-bold text-ink">{item.employee_name}</p>
                        <p className="text-[9px] text-muted">{item.employee_code} · {MEAL_LABELS[item.meal_type]}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-ink">{formatTime(item.redeemed_at)}</p>
                        <p className="text-[8px] text-muted">{METHOD_LABELS[item.method as keyof typeof METHOD_LABELS] ?? item.method}</p>
                      </div>
                      {item.offline ? <Badge variant="warning">Off</Badge> : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Cola offline</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted">Tokens cifrados en este dispositivo</p>
              </div>
              <Badge variant={pending.length > 0 ? "warning" : "success"}>{pending.length} pendientes</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {pending.length === 0 ? (
                <div className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[10px] leading-relaxed text-brand-800">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                  <span>No hay consumos pendientes. Los registros offline se cifran con AES-GCM antes de guardarse.</span>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {pending.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded-lg border border-citrus-200 bg-citrus-100/40 px-2.5 py-2">
                        <CloudOff className="size-3.5 shrink-0 text-[#8a6110]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[10px] font-bold text-ink">{MEAL_LABELS[item.meal_type]} · {relativeTime(item.created_at)}</p>
                          <p className="text-[8px] text-muted">{item.method.toUpperCase()} · queda en cola cifrada</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full" onClick={() => void syncQueue()} loading={syncing} icon={<RefreshCw className="size-4" />}>
                    Sincronizar ahora
                  </Button>
                  <p className="text-[9px] leading-relaxed text-muted">
                    Ventana de gracia: 10 minutos desde la generación del QR. Los duplicados se rechazan con idempotencia.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-brand-950 text-white">
            <CardContent className="p-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-citrus-300">
                <Fingerprint className="size-4" />
              </span>
              <p className="mt-3 text-xs font-bold text-white">Biometría opcional</p>
              <p className="mt-1 text-[10px] leading-relaxed text-brand-100/70">
                La huella o passkey es un método alternativo. Nunca se almacena la imagen de la huella: solo una credencial
                criptográfica revocable. El QR y el PIN siguen disponibles como respaldo.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        open={deviceModal}
        onClose={() => setDeviceModal(false)}
        title="Caja autorizada"
        description="Asocia este navegador a una caja registrada por el administrador. El token se guarda solo en este dispositivo."
        size="sm"
        footer={
          <>
            {hasDeviceToken ? (
              <Button variant="dangerSoft" onClick={clearDeviceToken}>Quitar token</Button>
            ) : null}
            <Button variant="secondary" onClick={() => setDeviceModal(false)}>Cancelar</Button>
            <Button onClick={saveDeviceToken} icon={<ShieldCheck className="size-4" />}>Guardar token</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field
            label="Token de la caja"
            hint="El administrador lo muestra una sola vez al registrar el dispositivo en Seguridad y auditoría."
          >
            <Input
              value={deviceTokenInput}
              onChange={(event) => setDeviceTokenInput(event.target.value)}
              placeholder="Pega aquí el token de 64 caracteres"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-[11px]"
            />
          </Field>
          {hasDeviceToken ? (
            <Alert variant="success" title="Caja configurada">
              Las validaciones de este navegador se asociarán al dispositivo autorizado.
            </Alert>
          ) : (
            <Alert variant="warning" title="Sin token de caja">
              Si el administrador activa «Exigir dispositivo registrado», este navegador no podrá validar hasta configurar el token.
            </Alert>
          )}
        </div>
      </Modal>
    </div>
  );
}
