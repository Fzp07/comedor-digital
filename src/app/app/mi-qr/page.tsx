"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Fingerprint,
  KeyRound,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UtensilsCrossed,
  WifiOff,
} from "lucide-react";
import QRCode from "qrcode";
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
  PageHeader,
  ProgressBar,
  Skeleton,
  Tabs,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { EmployeeWallet, MealType } from "@/lib/types";
import { formatTime, MEAL_LABELS, METHOD_LABELS, relativeTime, todayISO } from "@/lib/utils";

interface TokenPayload {
  ok?: boolean;
  message?: string;
  token?: string;
  expires_at?: string;
  ttl_seconds?: number;
  meal_type?: MealType;
  plan?: { name: string; meals_per_day: number };
  allow_offline?: boolean;
  consumed?: boolean;
  window?: { start: string; end: string };
  employee?: {
    id: string;
    full_name: string;
    code: string;
    photo_url: string | null;
    site_name: string;
    cost_center: string | null;
  };
}

function isResponse(value: unknown): value is Response {
  return typeof value === "object" && value !== null && "json" in value && "status" in value;
}

async function callFunction(name: string, body: Record<string, unknown>): Promise<{
  data: TokenPayload | null;
  network: boolean;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      const context = (error as { context?: unknown }).context;
      if (isResponse(context)) {
        try {
          const parsed = (await context.json()) as TokenPayload;
          return { data: parsed, network: false, error: parsed.message ?? error.message };
        } catch {
          return { data: null, network: false, error: error.message };
        }
      }
      return { data: null, network: true, error: error.message };
    }
    return { data: (data ?? null) as TokenPayload | null, network: false, error: null };
  } catch (invokeError) {
    return {
      data: null,
      network: true,
      error: invokeError instanceof Error ? invokeError.message : "No pudimos contactar el servidor.",
    };
  }
}

export default function MyQrPage() {
  return (
    <RoleGate roles={["empleado"]}>
      <MyQrContent />
    </RoleGate>
  );
}

function MyQrContent() {
  const [wallet, setWallet] = useState<EmployeeWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [meal, setMeal] = useState<MealType>("almuerzo");
  const [token, setToken] = useState<TokenPayload | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const refreshingRef = useRef(false);

  const requestToken = useCallback(async (nextMeal: MealType, silent = false) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);
    const response = await callFunction("qr-token", { meal_type: nextMeal });
    refreshingRef.current = false;
    setRefreshing(false);
    setLoading(false);

    if (response.network) {
      setError("Sin conexión. El QR dinámico necesita internet; puedes usar tu PIN de respaldo en la caja.");
      setToken(null);
      setQrDataUrl(null);
      return;
    }

    const payload = response.data;
    if (!payload || payload.ok === false || !payload.token) {
      setError(payload?.message ?? response.error ?? "No pudimos generar tu QR.");
      setToken(payload);
      setQrDataUrl(null);
      setExpiresAt(null);
      return;
    }

    setToken(payload);
    setExpiresAt(new Date(payload.expires_at ?? Date.now()).getTime());
  }, []);

  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    const { data, error: walletError } = await supabase.rpc("get_employee_wallet");
    if (!walletError && data) {
      const parsed = data as EmployeeWallet;
      setWallet(parsed);
      const firstPlan = parsed.plans?.[0];
      if (firstPlan) {
        setMeal((current) => {
          const exists = parsed.plans?.some((plan) => plan.meal_type === current);
          return exists ? current : firstPlan.meal_type;
        });
      }
    }
    setWalletLoading(false);
  }, []);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      setError("Sin conexión. Cuando vuelvas a estar en línea podrás generar un nuevo QR.");
      return;
    }
    void requestToken(meal);
  }, [meal, online, requestToken]);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (!online || secondsLeft > 3 || secondsLeft <= 0) return;
    if (!token?.token) return;
    void requestToken(meal, true);
  }, [secondsLeft, online, meal, requestToken, token?.token]);

  useEffect(() => {
    if (!token?.token) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(token.token, {
      width: 720,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0b3b32", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token?.token]);

  const plans = useMemo(() => wallet?.plans ?? [], [wallet?.plans]);
  const activePlan = plans.find((plan) => plan.meal_type === meal) ?? plans[0];
  const employee = token?.employee ?? wallet?.employee;
  const progress = token?.ttl_seconds ? Math.max(0, Math.min(100, (secondsLeft / token.ttl_seconds) * 100)) : 0;
  const isConsumed = Boolean(token?.consumed);
  const hasError = Boolean(error);

  const mealTabs = useMemo(() => {
    if (plans.length <= 1) return [];
    return plans
      .filter((plan, index, list) => list.findIndex((item) => item.meal_type === plan.meal_type) === index)
      .map((plan) => ({ value: plan.meal_type, label: MEAL_LABELS[plan.meal_type] }));
  }, [plans]);

  if (walletLoading && !wallet) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-2/3" />
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-[32rem] xl:col-span-2" />
          <Skeleton className="h-[32rem]" />
        </div>
      </div>
    );
  }

  if (!wallet?.linked || !employee) {
    return (
      <div className="animate-rise">
        <PageHeader eyebrow="Empleado" title="Mi QR" description="Tu carné digital para acceder al comedor." />
        <Card>
          <EmptyState
            icon={<AlertTriangle className="size-5" />}
            title="Tu usuario aún no está vinculado a un empleado"
            description="Pide a Recursos Humanos que asocie tu correo con tu registro de empleado para poder generar el QR y consultar tus consumos."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={`Hola, ${employee.full_name.split(" ")[0]}`}
        title="Mi QR del comedor"
        description="Presenta este código en la caja. Rota automáticamente cada 45 segundos y solo puede usarse una vez."
        actions={
          <>
            <Badge variant={online ? "success" : "warning"}>
              {online ? <Smartphone className="size-3.5" /> : <WifiOff className="size-3.5" />}
              {online ? "En línea" : "Sin conexión"}
            </Badge>
            <Button
              variant="secondary"
              icon={<RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />}
              onClick={() => void requestToken(meal)}
              disabled={!online || refreshing}
            >
              Actualizar
            </Button>
          </>
        }
      />

      {!online ? (
        <Alert variant="warning" className="mb-4" title="Modo sin conexión">
          El QR dinámico requiere internet. Mientras tanto, puedes validar con tu PIN de respaldo en la caja del comedor.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="bg-brand-950 px-5 py-4 text-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={employee.full_name} src={employee.photo_url} size="md" className="ring-white/20" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">{employee.full_name}</p>
                  <p className="text-[10px] text-brand-100/70">{employee.code} · {employee.site_name}</p>
                </div>
              </div>
              <Badge variant="dark" className="border border-white/15 bg-white/10 text-white">
                <BadgeCheck className="size-3.5 text-citrus-300" /> Empleado activo
              </Badge>
            </div>
          </div>

          <CardContent className="p-5">
            {mealTabs.length > 1 ? (
              <Tabs tabs={mealTabs} value={meal} onChange={(value) => setMeal(value as MealType)} className="mb-4 w-fit" />
            ) : null}

            {isConsumed ? (
              <div className="flex flex-col items-center rounded-2xl border border-brand-200 bg-brand-50 px-5 py-10 text-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-brand-600 text-white">
                  <CheckCircle2 className="size-8" />
                </span>
                <p className="mt-4 text-lg font-extrabold text-ink">Ya registraste {MEAL_LABELS[meal]} hoy</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
                  {token?.message ?? "Tu consumo quedó registrado. Puedes consultar el detalle en tu historial."}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link href="/app/historial"><Button variant="secondary" icon={<Clock3 className="size-4" />}>Ver historial</Button></Link>
                  {employee.site_name ? <Badge variant="outline">{employee.site_name}</Badge> : null}
                </div>
              </div>
            ) : hasError ? (
              <div className="flex flex-col items-center rounded-2xl border border-citrus-200 bg-citrus-100/40 px-5 py-10 text-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-citrus-400/30 text-[#7a5a12]">
                  <CalendarClock className="size-8" />
                </span>
                <p className="mt-4 text-lg font-extrabold text-ink">El QR no está disponible ahora</p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">{error}</p>
                {token?.window ? (
                  <p className="mt-3 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-ink">
                    Horario de servicio: {token.window.start.slice(0, 5)} – {token.window.end.slice(0, 5)}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={() => void requestToken(meal)} icon={<RefreshCw className="size-4" />}>Reintentar</Button>
                  <Link href="/app/historial"><Button variant="ghost" icon={<Clock3 className="size-4" />}>Mi historial</Button></Link>
                </div>
              </div>
            ) : loading || !qrDataUrl ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-paper/40 px-5 py-16">
                <Loader2 className="size-7 animate-spin text-brand-600" />
                <p className="mt-3 text-xs font-semibold text-muted">Generando un QR seguro…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="relative rounded-3xl border border-line bg-white p-4 shadow-soft sm:p-6">
                  {/* eslint-disable-next-line @next/next/no-img-element -- QR generado en el navegador como data URL */}
                  <img src={qrDataUrl} alt={`Código QR de ${employee.full_name}`} className="size-64 sm:size-72" />
                  <span className="absolute -right-2 -top-2 flex size-9 items-center justify-center rounded-full bg-brand-700 text-white shadow-soft">
                    <QrCode className="size-4" />
                  </span>
                </div>

                <div className="mt-5 w-full max-w-xs">
                  <div className="mb-1.5 flex items-center justify-between text-[10px]">
                    <span className="font-bold text-muted">Vigencia del código</span>
                    <span className={`font-extrabold ${secondsLeft <= 8 ? "text-clay-500" : "text-brand-700"}`}>
                      {secondsLeft > 0 ? `${secondsLeft} s` : "Actualizando…"}
                    </span>
                  </div>
                  <ProgressBar value={progress} tone={secondsLeft <= 8 ? "clay" : "brand"} />
                  <p className="mt-2 text-center text-[9px] text-muted">
                    Válido hasta {token?.expires_at ? formatTime(token.expires_at) : "—"} · No compartas este código.
                  </p>
                </div>

                <div className="mt-5 grid w-full max-w-md grid-cols-2 gap-2">
                  <div className="rounded-xl border border-line bg-paper/50 px-3 py-2.5 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Comida</p>
                    <p className="mt-0.5 text-xs font-extrabold text-ink">{MEAL_LABELS[meal]}</p>
                  </div>
                  <div className="rounded-xl border border-line bg-paper/50 px-3 py-2.5 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Plan</p>
                    <p className="mt-0.5 truncate text-xs font-extrabold text-ink">{activePlan?.name ?? token?.plan?.name ?? "—"}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[10px] leading-relaxed text-brand-800">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                  <span>El QR está firmado con HMAC-SHA256 y su nonce se invalida al primer uso. Si alguien lo copia, no podrá reutilizarlo.</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Mi plan de hoy</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted">{todayISO()}</p>
              </div>
              <Badge variant={activePlan ? "success" : "muted"}>{activePlan ? "Activo" : "Sin plan"}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {plans.length === 0 ? (
                <EmptyState icon={<UtensilsCrossed className="size-5" />} title="Sin plan asignado" description="Pide a RR.HH. que active tu plan de alimentación." />
              ) : (
                plans.map((plan) => {
                  const quota = Math.max(1, plan.meals_per_day);
                  const used = Math.min(plan.used_today, quota);
                  return (
                    <div key={plan.id} className="rounded-xl border border-line bg-paper/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-bold text-ink">{plan.name}</p>
                          <p className="text-[9px] text-muted">{MEAL_LABELS[plan.meal_type]} · {plan.meals_per_day} por día</p>
                        </div>
                        <Badge variant={used >= quota ? "warning" : "muted"}>{used}/{quota}</Badge>
                      </div>
                      <div className="mt-2"><ProgressBar value={(used / quota) * 100} tone={used >= quota ? "clay" : "brand"} /></div>
                      <p className="mt-1.5 text-[9px] text-muted">
                        {used >= quota ? "Cupo de hoy agotado" : `${quota - used} consumo${quota - used === 1 ? "" : "s"} disponible${quota - used === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Métodos de respaldo</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted">Siempre hay una alternativa</p>
              </div>
              <KeyRound className="size-4 text-brand-600" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-line bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><KeyRound className="size-4" /></span>
                  <div>
                    <p className="text-[11px] font-bold text-ink">PIN de comedor</p>
                    <p className="text-[9px] text-muted">Configurado por RR.HH. · 4 a 6 dígitos</p>
                  </div>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted">
                  Si tu celular no tiene batería o no hay señal, dicta tu código de empleado y PIN en la caja. Nunca compartas tu PIN.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-paper/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-paper-deep text-muted"><Fingerprint className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-ink">Huella / passkey</p>
                    <p className="text-[9px] text-muted">Opcional · requiere consentimiento</p>
                  </div>
                  <Badge variant="outline">Fase 2</Badge>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted">
                  La biometría es un método alternativo, nunca obligatorio. No se almacena la imagen de la huella: solo una
                  credencial criptográfica revocable, previa autorización.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-brand-50/70">
            <CardContent className="p-4">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" />
                <div>
                  <p className="text-[11px] font-bold text-brand-900">Tus datos, bajo control</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-brand-900/70">
                    Tratamos tus datos conforme a la Ley 1581 de Colombia. Puedes consultar el aviso de privacidad y tus derechos.
                  </p>
                  <Link href="/privacidad" className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-brand-700 hover:underline">
                    Ver aviso de privacidad <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Mis últimos consumos</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">Registro inmutable de tu alimentación</p>
            </div>
            <Link href="/app/historial" className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-700 hover:underline">
              Ver todo <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {(wallet.history?.length ?? 0) === 0 ? (
              <EmptyState icon={<UtensilsCrossed className="size-5" />} title="Aún no tienes consumos" description="Cuando valides tu primer almuerzo o merienda aparecerá aquí." />
            ) : (
              <div className="divide-y divide-line/70">
                {wallet.history?.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <UtensilsCrossed className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-ink">{MEAL_LABELS[item.meal_type]} · {item.site}</p>
                      <p className="text-[9px] text-muted">{METHOD_LABELS[item.method]} · {item.ticket_code ?? "Consumo directo"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-ink">{formatTime(item.redeemed_at)}</p>
                      <p className="text-[9px] text-muted">{relativeTime(item.redeemed_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Horarios de servicio</CardTitle>
            <Clock3 className="size-4 text-brand-600" />
          </CardHeader>
          <CardContent className="space-y-2">
            {(wallet.windows ?? []).length === 0 ? (
              <p className="text-[10px] text-muted">Tu sede no tiene horarios configurados.</p>
            ) : (
              wallet.windows?.map((window) => (
                <div key={`${window.meal_type}-${window.start_time}`} className="flex items-center justify-between gap-2 rounded-lg border border-line/80 bg-paper/40 px-3 py-2">
                  <div>
                    <p className="text-[10px] font-bold text-ink">{MEAL_LABELS[window.meal_type]}</p>
                    <p className="text-[9px] text-muted">{window.name}</p>
                  </div>
                  <span className="text-[10px] font-bold text-brand-700">{window.start_time.slice(0, 5)} – {window.end_time.slice(0, 5)}</span>
                </div>
              ))
            )}
            <p className="pt-1 text-[9px] leading-relaxed text-muted">
              El QR solo se genera dentro del horario de servicio y con un plan vigente para el día.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
