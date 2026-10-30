"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Clock3,
  Plus,
  QrCode,
  ScanLine,
  ShieldCheck,
  Ticket,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";
import type { DashboardData, MealType, ServiceWindow } from "@/lib/types";
import { formatDateLong, formatTime, MEAL_LABELS, mealWindowStatus, percent, relativeTime, todayISO } from "@/lib/utils";
import { RoleGate } from "@/components/app-shell";
import { DonutChart } from "@/components/charts";
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
  StatCard,
} from "@/components/ui";

interface MenuRow {
  id: string;
  title: string;
  description: string | null;
  meal_type: MealType;
  calories: number | null;
  sites?: { name: string };
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "2-digit", hour12: false }).format(new Date()),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 18) return "Buenas tardes";
  return "Buenas noches";
}

export default function DashboardPage() {
  return (
    <RoleGate roles={["admin", "rrhh", "supervisor", "auditor"]}>
      <DashboardContent />
    </RoleGate>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [windows, setWindows] = useState<ServiceWindow[]>([]);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: dashboard, error: dashboardError } = await supabase.rpc("get_dashboard");
    if (dashboardError) {
      setError(dashboardError.message);
      setLoading(false);
      return;
    }
    setData(dashboard as DashboardData);

    const [windowsResult, menusResult] = await Promise.all([
      supabase.from("service_windows").select("*").eq("active", true),
      supabase
        .from("menus")
        .select("id,title,description,meal_type,calories,sites(name)")
        .eq("menu_date", todayISO())
        .eq("active", true),
    ]);
    setWindows((windowsResult.data ?? []) as ServiceWindow[]);
    setMenus((menusResult.data ?? []) as unknown as MenuRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "redemptions" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const lunchWindow = mealWindowStatus(windows, "almuerzo");
  const snackWindow = mealWindowStatus(windows, "merienda");
  const totalTickets = Object.values(data?.ticket_status ?? {}).reduce((sum, value) => sum + Number(value), 0);
  const statusSegments = [
    { label: "Disponibles", value: Number(data?.ticket_status?.disponible ?? 0), color: "#209d80" },
    { label: "Usados", value: Number(data?.ticket_status?.usado ?? 0), color: "#0f443b" },
    { label: "Anulados", value: Number(data?.ticket_status?.anulado ?? 0), color: "#df7a5e" },
    { label: "Vencidos", value: Number(data?.ticket_status?.vencido ?? 0), color: "#f2c14e" },
    { label: "Emitidos", value: Number(data?.ticket_status?.emitido ?? 0), color: "#5ca8bc" },
  ].filter((segment) => segment.value > 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-80 xl:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader eyebrow="Operación" title="Panel general" description="No pudimos cargar el panel." />
        <Alert variant="danger" title="Error de conexión">{error}</Alert>
        <div className="mt-4"><Button onClick={() => void load()}>Reintentar</Button></div>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={`${greeting()}, ${firstName}`}
        title="Así va el comedor hoy."
        description={`${formatDateLong(new Date())} · Consumos, tiquetes y alertas de todas las sedes en tiempo real.`}
        actions={
          <>
            <Button variant="secondary" icon={<ClipboardList className="size-4" />} onClick={() => router.push("/app/reportes")}>
              Ver reportes
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => router.push("/app/tiquetes?nuevo=1")}>
              Emitir tiquetes
            </Button>
          </>
        }
      />

      {profile?.role === "admin" && !profile.mfa_enrolled ? (
        <Alert variant="warning" title="Seguridad pendiente" className="mb-5">
          Tu cuenta de administrador aún no tiene MFA.{" "}
          <Link href="/app/seguridad" className="font-bold underline">Actívalo ahora</Link> para cumplir con la política de seguridad.
        </Alert>
      ) : null}

      {data && data.alerts > 0 ? (
        <Link href="/app/seguridad" className="mb-5 flex items-center gap-3 rounded-2xl border border-citrus-200 bg-citrus-100/70 px-4 py-3 transition hover:border-citrus-300">
          <span className="flex size-9 items-center justify-center rounded-xl bg-citrus-400/30 text-[#8a6110]">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#6d4e0d]">{data.alerts} alertas de seguridad requieren revisión</p>
            <p className="mt-0.5 text-[10px] text-[#8a6110]/80">Revisa eventos críticos, reintentos de QR y consumos offline.</p>
          </div>
          <ArrowUpRight className="size-4 text-[#8a6110]" />
        </Link>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Consumos hoy"
          value={data?.redemptions_today ?? 0}
          hint={`${data?.tickets_used_today ?? 0} tiquetes usados`}
          icon={<UtensilsCrossed className="size-5" />}
          tone="brand"
        />
        <StatCard
          label="Tiquetes disponibles"
          value={data?.tickets_available ?? 0}
          hint="Listos para validar hoy"
          icon={<Ticket className="size-5" />}
          tone="citrus"
        />
        <StatCard
          label="Empleados activos"
          value={data?.employees_active ?? 0}
          hint={`${data?.sites.length ?? 0} sedes en operación`}
          icon={<Users className="size-5" />}
          tone="sky"
        />
        <StatCard
          label="Alertas abiertas"
          value={data?.alerts ?? 0}
          hint="Eventos de seguridad sin resolver"
          icon={<ShieldCheck className="size-5" />}
          tone={data?.alerts ? "clay" : "brand"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Ocupación por sede</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">Consumos de hoy frente al total de empleados activos.</p>
            </div>
            <Badge variant="outline"><CalendarDays className="size-3" /> Hoy</Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            {(data?.sites ?? []).map((site) => {
              const occupancy = percent(site.redemptions_today, site.employees);
              return (
                <div key={site.id}>
                  <div className="mb-1.5 flex items-end justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                        <ChefHat className="size-4" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-ink">{site.name}</p>
                        <p className="text-[10px] text-muted">{site.employees} empleados · {site.tickets_available} tiquetes disponibles</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-ink">{site.redemptions_today}<span className="text-[10px] font-medium text-muted"> / {site.employees}</span></p>
                      <p className="text-[9px] font-semibold text-brand-600">{occupancy}% ocupación</p>
                    </div>
                  </div>
                  <ProgressBar value={occupancy} tone={occupancy > 85 ? "clay" : occupancy > 55 ? "brand" : "citrus"} />
                </div>
              );
            })}
            {(data?.sites.length ?? 0) === 0 ? (
              <EmptyState icon={<ChefHat className="size-5" />} title="Aún no hay sedes activas" description="Configura la primera sede en Configuración." />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Estado de tiquetes</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">Últimos 7 días</p>
            </div>
            <Badge variant="muted">{totalTickets} total</Badge>
          </CardHeader>
          <CardContent>
            <DonutChart
              segments={statusSegments}
              centerValue={data?.tickets_available ?? 0}
              centerLabel="disponibles hoy"
              size={138}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Últimos consumos</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">Validaciones registradas en el comedor.</p>
            </div>
            <Link href="/app/historial" className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-700 hover:underline">
              Ver todo <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {(data?.recent.length ?? 0) === 0 ? (
              <EmptyState icon={<ScanLine className="size-5" />} title="Sin consumos todavía" description="Cuando el operador valide el primer QR aparecerá aquí." />
            ) : (
              <div className="divide-y divide-line/70">
                {data?.recent.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-paper/50">
                    <Avatar name={item.employee} src={item.photo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-ink">{item.employee}</p>
                      <p className="text-[10px] text-muted">{item.code} · {item.site}</p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-[10px] font-semibold text-ink">{MEAL_LABELS[item.meal_type]}</p>
                      <p className="text-[9px] text-muted">{item.method === "qr" ? "QR dinámico" : item.method === "pin" ? "PIN" : item.method}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={item.offline ? "warning" : "success"}>{item.offline ? "Offline" : "En línea"}</Badge>
                      <span className="text-[9px] text-muted">{relativeTime(item.redeemed_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Servicio de hoy</CardTitle>
              <Badge variant={lunchWindow.open || snackWindow.open ? "success" : "muted"}>
                {lunchWindow.open || snackWindow.open ? "Abierto" : "Cerrado"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {(["almuerzo", "merienda"] as MealType[]).map((meal) => {
                const status = meal === "almuerzo" ? lunchWindow : snackWindow;
                return (
                  <div key={meal} className="flex items-center gap-3 rounded-xl border border-line/80 bg-paper/50 px-3 py-2.5">
                    <span className={`flex size-9 items-center justify-center rounded-lg ${status.open ? "bg-brand-100 text-brand-700" : "bg-paper-deep text-muted"}`}>
                      <Clock3 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-ink">{MEAL_LABELS[meal]}</p>
                      <p className="text-[10px] text-muted">{status.label}</p>
                    </div>
                    <Badge variant={status.open ? "success" : "outline"}>{status.open ? "Abierto" : "Fuera de hora"}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Acciones rápidas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { label: "Emitir tiquetes", icon: Ticket, href: "/app/tiquetes?nuevo=1", roles: ["admin", "rrhh"] },
                { label: "Validar QR", icon: QrCode, href: "/app/operador", roles: ["admin", "rrhh", "supervisor"] },
                { label: "Nuevo empleado", icon: Users, href: "/app/empleados?nuevo=1", roles: ["admin", "rrhh"] },
                { label: "Ver reportes", icon: ClipboardList, href: "/app/reportes", roles: ["admin", "rrhh", "supervisor", "auditor"] },
              ]
                .filter((action) => profile && action.roles.includes(profile.role))
                .map((action) => (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="group flex flex-col gap-2 rounded-xl border border-line bg-paper/40 p-3 transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    <action.icon className="size-4 text-brand-600" />
                    <span className="text-[11px] font-bold text-ink">{action.label}</span>
                  </Link>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Menú del día</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">Publicado por cada sede para hoy.</p>
            </div>
            <Badge variant="outline"><UtensilsCrossed className="size-3" /> {todayISO()}</Badge>
          </CardHeader>
          <CardContent>
            {menus.length === 0 ? (
              <EmptyState icon={<UtensilsCrossed className="size-5" />} title="Aún no hay menú publicado" description="Puedes cargarlo desde Configuración → Menús." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {menus.map((menu) => (
                  <div key={menu.id} className="rounded-xl border border-line bg-paper/40 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={menu.meal_type === "almuerzo" ? "default" : "warning"}>{MEAL_LABELS[menu.meal_type]}</Badge>
                      <span className="text-[9px] font-semibold text-muted">{menu.sites?.name}</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-ink">{menu.title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{menu.description}</p>
                    {menu.calories ? <p className="mt-2 text-[9px] font-semibold text-brand-600">{menu.calories} kcal</p> : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-brand-950 text-white">
          <CardContent className="flex h-full flex-col justify-between p-5">
            <div>
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-citrus-300">
                <BadgeCheck className="size-5" />
              </span>
              <h3 className="mt-4 font-display text-2xl leading-tight text-white">Cada consumo cuenta.</h3>
              <p className="mt-2 text-xs leading-relaxed text-brand-100/70">
                La conciliación de cocina y los reportes por centro de costo te ayudan a detectar
                diferencias antes de que se conviertan en pérdidas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/app/reportes")}
              className="mt-5 inline-flex items-center gap-2 text-[11px] font-bold text-citrus-300 hover:underline"
            >
              Revisar conciliación <ArrowRight className="size-3.5" />
            </button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-[10px] text-muted">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-brand-600" /> Datos protegidos con RLS por rol y sede.</span>
        <span>Actualizado {formatTime(new Date())}</span>
      </div>
    </div>
  );
}
