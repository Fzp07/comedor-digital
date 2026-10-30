"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Download,
  FileDown,
  Filter,
  Mail,
  Plus,
  RefreshCw,
  ShieldAlert,
  Ticket,
  TrendingUp,
  UtensilsCrossed,
  WifiOff,
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
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  StatCard,
  Tabs,
  Textarea,
  TicketStatusBadge,
} from "@/components/ui";
import { BarChart, DonutChart } from "@/components/charts";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { supabase } from "@/lib/supabase";
import type { CompanySettings, MealType, Site, TicketStatus } from "@/lib/types";
import {
  addDaysISO,
  downloadCsv,
  formatDate,
  MEAL_LABELS,
  percent,
  TICKET_STATUS_LABELS,
  todayISO,
} from "@/lib/utils";

interface DailyRow {
  redemption_date: string;
  site_id: string;
  site_name: string;
  meal_type: MealType;
  total: number;
  employees: number;
  offline_total: number;
  overrides: number;
}

interface CostRow {
  redemption_date: string;
  cost_center_id: string | null;
  cost_center_name: string;
  meal_type: MealType;
  total: number;
}

interface TicketRow {
  service_date: string;
  site_id: string;
  site_name: string;
  meal_type: MealType;
  status: TicketStatus;
  total: number;
}

interface ExceptionRow {
  id: string;
  redemption_date: string;
  redeemed_at: string;
  exception_type: string;
  meal_type: MealType;
  full_name: string;
  code: string;
  site_name: string;
  detail: string | null;
}

interface KitchenRow {
  id: string;
  site_id: string;
  site_name: string;
  reconciliation_date: string;
  meal_type: MealType;
  meals_prepared: number;
  meals_served: number;
  difference: number;
  notes: string | null;
  created_at: string;
}

const DATE_PRESETS = [
  { label: "Hoy", from: () => todayISO(), to: () => todayISO() },
  { label: "7 días", from: () => addDaysISO(-6), to: () => todayISO() },
  { label: "30 días", from: () => addDaysISO(-29), to: () => todayISO() },
  { label: "Este mes", from: () => `${todayISO().slice(0, 7)}-01`, to: () => todayISO() },
];

const EXCEPTION_LABELS: Record<string, string> = {
  offline: "Consumo offline",
  override: "Excepción autorizada",
  pin: "Validación con PIN",
  manual: "Registro manual",
  duplicate: "Intento duplicado",
};

export default function ReportsPage() {
  return (
    <RoleGate roles={["admin", "rrhh", "supervisor", "auditor"]}>
      <ReportsContent />
    </RoleGate>
  );
}

function ReportsContent() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const canEditKitchen = profile?.role === "admin" || profile?.role === "supervisor";

  const [tab, setTab] = useState("resumen");
  const [dateFrom, setDateFrom] = useState(addDaysISO(-6));
  const [dateTo, setDateTo] = useState(todayISO());
  const [siteFilter, setSiteFilter] = useState("todas");
  const [mealFilter, setMealFilter] = useState("todas");
  const [sites, setSites] = useState<Site[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [kitchen, setKitchen] = useState<KitchenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kitchenOpen, setKitchenOpen] = useState(false);
  const [kitchenForm, setKitchenForm] = useState({
    site_id: "",
    reconciliation_date: todayISO(),
    meal_type: "almuerzo" as MealType,
    meals_prepared: "0",
    meals_served: "0",
    notes: "",
  });
  const [savingKitchen, setSavingKitchen] = useState(false);
  const [kitchenError, setKitchenError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let siteCostCenterIds: string[] | null = null;
    if (siteFilter !== "todas") {
      const { data: centerData } = await supabase.from("cost_centers").select("id").eq("site_id", siteFilter);
      siteCostCenterIds = (centerData ?? []).map((center) => center.id);
    }

    let dailyQuery = supabase
      .from("v_daily_summary")
      .select("*")
      .gte("redemption_date", dateFrom)
      .lte("redemption_date", dateTo)
      .order("redemption_date");
    let costQuery = supabase
      .from("v_cost_center_summary")
      .select("*")
      .gte("redemption_date", dateFrom)
      .lte("redemption_date", dateTo);
    let ticketQuery = supabase
      .from("v_ticket_summary")
      .select("*")
      .gte("service_date", dateFrom)
      .lte("service_date", dateTo);
    const exceptionQuery = supabase
      .from("v_exceptions")
      .select("*")
      .gte("redemption_date", dateFrom)
      .lte("redemption_date", dateTo)
      .order("redeemed_at", { ascending: false })
      .limit(500);
    let kitchenQuery = supabase
      .from("v_kitchen_summary")
      .select("*")
      .gte("reconciliation_date", dateFrom)
      .lte("reconciliation_date", dateTo)
      .order("reconciliation_date", { ascending: false });

    if (siteFilter !== "todas") {
      dailyQuery = dailyQuery.eq("site_id", siteFilter);
      if (siteCostCenterIds) costQuery = costQuery.in("cost_center_id", siteCostCenterIds);
      ticketQuery = ticketQuery.eq("site_id", siteFilter);
      kitchenQuery = kitchenQuery.eq("site_id", siteFilter);
    }
    if (mealFilter !== "todas") {
      dailyQuery = dailyQuery.eq("meal_type", mealFilter);
      costQuery = costQuery.eq("meal_type", mealFilter);
      ticketQuery = ticketQuery.eq("meal_type", mealFilter);
      kitchenQuery = kitchenQuery.eq("meal_type", mealFilter);
    }

    const [dailyResult, costResult, ticketResult, exceptionResult, kitchenResult, siteResult, settingsResult] = await Promise.all([
      dailyQuery,
      costQuery,
      ticketQuery,
      exceptionQuery,
      kitchenQuery,
      supabase.from("sites").select("*").eq("active", true).order("name"),
      supabase.from("company_settings").select("*").eq("id", true).maybeSingle(),
    ]);

    const firstError = [dailyResult.error, costResult.error, ticketResult.error, exceptionResult.error, kitchenResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setDaily((dailyResult.data ?? []) as DailyRow[]);
    setCosts((costResult.data ?? []) as CostRow[]);
    setTickets((ticketResult.data ?? []) as TicketRow[]);
    setExceptions((exceptionResult.data ?? []) as ExceptionRow[]);
    setKitchen((kitchenResult.data ?? []) as KitchenRow[]);
    setSites((siteResult.data ?? []) as Site[]);
    setSettings((settingsResult.data ?? null) as CompanySettings | null);
    setLoading(false);
  }, [dateFrom, dateTo, mealFilter, siteFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("reports-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "redemptions" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const totals = useMemo(() => {
    const total = daily.reduce((sum, row) => sum + Number(row.total), 0);
    const offline = daily.reduce((sum, row) => sum + Number(row.offline_total), 0);
    const overrides = daily.reduce((sum, row) => sum + Number(row.overrides), 0);
    const employees = daily.reduce((sum, row) => sum + Number(row.employees), 0);
    const ticketTotal = tickets.reduce((sum, row) => sum + Number(row.total), 0);
    const usedTickets = tickets.filter((row) => row.status === "usado").reduce((sum, row) => sum + Number(row.total), 0);
    return { total, offline, overrides, employees, ticketTotal, usedTickets };
  }, [daily, tickets]);

  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of daily) map.set(row.redemption_date, (map.get(row.redemption_date) ?? 0) + Number(row.total));
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ label: date.slice(5), value, hint: formatDate(date) }));
  }, [daily]);

  const bySite = useMemo(() => {
    const map = new Map<string, { name: string; total: number; offline: number; overrides: number }>();
    for (const row of daily) {
      const current = map.get(row.site_id) ?? { name: row.site_name, total: 0, offline: 0, overrides: 0 };
      current.total += Number(row.total);
      current.offline += Number(row.offline_total);
      current.overrides += Number(row.overrides);
      map.set(row.site_id, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [daily]);

  const byMeal = useMemo(() => {
    const lunch = daily.filter((row) => row.meal_type === "almuerzo").reduce((sum, row) => sum + Number(row.total), 0);
    const snack = daily.filter((row) => row.meal_type === "merienda").reduce((sum, row) => sum + Number(row.total), 0);
    return { lunch, snack };
  }, [daily]);

  const byCostCenter = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of costs) {
      const key = row.cost_center_name || "Sin centro de costo";
      map.set(key, (map.get(key) ?? 0) + Number(row.total));
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [costs]);

  const ticketStatus = useMemo(() => {
    const map = new Map<TicketStatus, number>();
    for (const row of tickets) map.set(row.status, (map.get(row.status) ?? 0) + Number(row.total));
    return map;
  }, [tickets]);

  const visibleExceptions = useMemo(() => {
    if (siteFilter === "todas") return exceptions;
    const siteName = sites.find((site) => site.id === siteFilter)?.name;
    return siteName ? exceptions.filter((row) => row.site_name === siteName) : exceptions;
  }, [exceptions, siteFilter, sites]);

  const kitchenDiff = kitchen.reduce((sum, row) => sum + Math.abs(Number(row.difference ?? 0)), 0);

  function exportCurrent() {
    if (tab === "costos") {
      downloadCsv(
        `reporte-centros-costo-${dateFrom}-${dateTo}.csv`,
        byCostCenter.map((row) => ({ centro_costo: row.name, consumos: row.total })),
        [{ key: "centro_costo", label: "Centro de costo" }, { key: "consumos", label: "Consumos" }],
      );
    } else if (tab === "tiquetes") {
      downloadCsv(
        `reporte-tiquetes-${dateFrom}-${dateTo}.csv`,
        tickets.map((row) => ({
          fecha: row.service_date,
          sede: row.site_name,
          comida: MEAL_LABELS[row.meal_type],
          estado: TICKET_STATUS_LABELS[row.status],
          total: row.total,
        })),
        [
          { key: "fecha", label: "Fecha" },
          { key: "sede", label: "Sede" },
          { key: "comida", label: "Comida" },
          { key: "estado", label: "Estado" },
          { key: "total", label: "Total" },
        ],
      );
    } else if (tab === "excepciones") {
      downloadCsv(
        `reporte-excepciones-${dateFrom}-${dateTo}.csv`,
        visibleExceptions.map((row) => ({
          fecha: row.redemption_date,
          empleado: row.full_name,
          codigo: row.code,
          sede: row.site_name,
          comida: MEAL_LABELS[row.meal_type],
          tipo: EXCEPTION_LABELS[row.exception_type] ?? row.exception_type,
          detalle: row.detail ?? "",
        })),
        [
          { key: "fecha", label: "Fecha" },
          { key: "empleado", label: "Empleado" },
          { key: "codigo", label: "Código" },
          { key: "sede", label: "Sede" },
          { key: "comida", label: "Comida" },
          { key: "tipo", label: "Tipo" },
          { key: "detalle", label: "Detalle" },
        ],
      );
    } else if (tab === "cocina") {
      downloadCsv(
        `conciliacion-cocina-${dateFrom}-${dateTo}.csv`,
        kitchen.map((row) => ({
          fecha: row.reconciliation_date,
          sede: row.site_name,
          comida: MEAL_LABELS[row.meal_type],
          preparados: row.meals_prepared,
          servidos: row.meals_served,
          diferencia: row.difference,
          notas: row.notes ?? "",
        })),
        [
          { key: "fecha", label: "Fecha" },
          { key: "sede", label: "Sede" },
          { key: "comida", label: "Comida" },
          { key: "preparados", label: "Preparados" },
          { key: "servidos", label: "Servidos" },
          { key: "diferencia", label: "Diferencia" },
          { key: "notas", label: "Notas" },
        ],
      );
    } else {
      downloadCsv(
        `reporte-consumos-${dateFrom}-${dateTo}.csv`,
        daily.map((row) => ({
          fecha: row.redemption_date,
          sede: row.site_name,
          comida: MEAL_LABELS[row.meal_type],
          consumos: row.total,
          empleados: row.employees,
          offline: row.offline_total,
          excepciones: row.overrides,
        })),
        [
          { key: "fecha", label: "Fecha" },
          { key: "sede", label: "Sede" },
          { key: "comida", label: "Comida" },
          { key: "consumos", label: "Consumos" },
          { key: "empleados", label: "Empleados" },
          { key: "offline", label: "Offline" },
          { key: "excepciones", label: "Excepciones" },
        ],
      );
    }

    if (profile) {
      void supabase.from("report_exports").insert({
        user_id: profile.id,
        report_type: tab,
        format: "csv",
        filters: { dateFrom, dateTo, siteFilter, mealFilter },
        status: "generado",
      });
    }
    toast({ title: "Reporte exportado", description: "El archivo CSV está listo para Excel o conciliación.", variant: "success" });
  }

  function openKitchen() {
    setKitchenForm({
      site_id: profile?.site_id ?? sites[0]?.id ?? "",
      reconciliation_date: todayISO(),
      meal_type: "almuerzo",
      meals_prepared: "0",
      meals_served: "0",
      notes: "",
    });
    setKitchenError(null);
    setKitchenOpen(true);
  }

  async function saveKitchen() {
    if (!kitchenForm.site_id) {
      setKitchenError("Selecciona una sede.");
      return;
    }
    const prepared = Number(kitchenForm.meals_prepared);
    const served = Number(kitchenForm.meals_served);
    if (!Number.isFinite(prepared) || prepared < 0 || !Number.isFinite(served) || served < 0) {
      setKitchenError("Las cantidades deben ser números mayores o iguales a cero.");
      return;
    }
    setSavingKitchen(true);
    setKitchenError(null);
    const payload = {
      site_id: kitchenForm.site_id,
      reconciliation_date: kitchenForm.reconciliation_date,
      meal_type: kitchenForm.meal_type,
      meals_prepared: prepared,
      meals_served: served,
      notes: kitchenForm.notes.trim() || null,
    };
    const { data: existing } = await supabase
      .from("kitchen_reconciliations")
      .select("id")
      .eq("site_id", payload.site_id)
      .eq("reconciliation_date", payload.reconciliation_date)
      .eq("meal_type", payload.meal_type)
      .maybeSingle();

    const { error: saveError } = existing
      ? await supabase.from("kitchen_reconciliations").update(payload).eq("id", existing.id)
      : await supabase.from("kitchen_reconciliations").insert({ ...payload, created_by: profile?.id });

    setSavingKitchen(false);
    if (saveError) {
      setKitchenError(saveError.message);
      return;
    }
    toast({ title: "Conciliación guardada", description: "La cocina y el comedor ya tienen una referencia común.", variant: "success" });
    setKitchenOpen(false);
    await load();
  }

  const tabs = [
    { value: "resumen", label: "Resumen" },
    { value: "sedes", label: "Sedes" },
    { value: "costos", label: "Centros de costo" },
    { value: "tiquetes", label: "Tiquetes" },
    { value: "excepciones", label: "Excepciones", count: visibleExceptions.length },
    { value: "cocina", label: "Cocina", count: kitchen.length },
  ];

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Analítica del comedor"
        title="Consultas y reportes"
        description="Consumos, costos, tiquetes, excepciones y conciliación de cocina en un solo lugar. Exporta a CSV o imprime en PDF."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCurrent}>
              Exportar CSV
            </Button>
            <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={() => window.print()}>
              PDF / Imprimir
            </Button>
          </>
        }
      />

      {error ? <Alert variant="danger" title="No pudimos cargar los reportes">{error}</Alert> : null}

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-3.5 xl:flex-row xl:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-muted" />
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-auto" aria-label="Desde" />
              <span className="text-[10px] text-muted">a</span>
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-auto" aria-label="Hasta" />
            </div>
            <Select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="w-auto">
              <option value="todas">Todas las sedes</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </Select>
            <Select value={mealFilter} onChange={(event) => setMealFilter(event.target.value)} className="w-auto">
              <option value="todas">Todas las comidas</option>
              <option value="almuerzo">Almuerzo</option>
              <option value="merienda">Merienda</option>
            </Select>
            <div className="flex flex-wrap gap-1">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => { setDateFrom(preset.from()); setDateTo(preset.to()); }}
                  className="rounded-lg border border-line bg-white px-2 py-1.5 text-[10px] font-bold text-muted transition hover:border-brand-300 hover:text-brand-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline"><Filter className="size-3" /> {dateFrom} → {dateTo}</Badge>
            <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Recargar"><RefreshCw className="size-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Consumos" value={totals.total} hint={`${byDate.length} días con actividad`} icon={<UtensilsCrossed className="size-5" />} />
        <StatCard label="Promedio diario" value={byDate.length ? Math.round(totals.total / byDate.length) : 0} hint="Consumos por día" icon={<TrendingUp className="size-5" />} tone="sky" />
        <StatCard label="Offline" value={`${totals.offline}`} hint={`${percent(totals.offline, totals.total)}% del total`} icon={<WifiOff className="size-5" />} tone={totals.offline ? "citrus" : "brand"} />
        <StatCard label="Excepciones" value={totals.overrides} hint="Autorizadas con doble control" icon={<ShieldAlert className="size-5" />} tone={totals.overrides ? "clay" : "brand"} />
      </div>

      <div className="mt-4">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {loading ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-80 xl:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      ) : (
        <>
          {tab === "resumen" ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <div>
                    <CardTitle>Consumos por día</CardTitle>
                    <p className="mt-0.5 text-[11px] text-muted">Almuerzos y meriendas validados en el periodo.</p>
                  </div>
                  <Badge variant="muted">{totals.total} total</Badge>
                </CardHeader>
                <CardContent>
                  {byDate.length === 0 ? (
                    <EmptyState icon={<BarChart3 className="size-5" />} title="Sin datos en el periodo" description="Cambia el rango de fechas o valida consumos en el comedor." />
                  ) : (
                    <BarChart data={byDate} height={210} />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Distribución por comida</CardTitle>
                    <p className="mt-0.5 text-[11px] text-muted">Participación del periodo</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <DonutChart
                    segments={[
                      { label: "Almuerzo", value: byMeal.lunch, color: "#209d80" },
                      { label: "Merienda", value: byMeal.snack, color: "#f2c14e" },
                    ]}
                    centerLabel="consumos"
                    centerValue={totals.total}
                  />
                </CardContent>
              </Card>

              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle>Ocupación por sede</CardTitle>
                  <Badge variant="outline">{bySite.length} sedes</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {bySite.length === 0 ? (
                    <p className="text-[11px] text-muted">Sin actividad en el periodo.</p>
                  ) : (
                    bySite.map((site) => {
                      const share = percent(site.total, totals.total);
                      return (
                        <div key={site.name}>
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><ChefHat className="size-4" /></span>
                              <div>
                                <p className="text-[11px] font-bold text-ink">{site.name}</p>
                                <p className="text-[9px] text-muted">{site.offline} offline · {site.overrides} excepciones</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-extrabold text-ink">{site.total}</p>
                              <p className="text-[9px] text-brand-600">{share}%</p>
                            </div>
                          </div>
                          <ProgressBar value={share} tone={share > 60 ? "brand" : "citrus"} />
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tiquetes del periodo</CardTitle>
                  <Ticket className="size-4 text-brand-600" />
                </CardHeader>
                <CardContent>
                  <DonutChart
                    segments={[
                      { label: "Usados", value: ticketStatus.get("usado") ?? 0, color: "#0f443b" },
                      { label: "Disponibles", value: ticketStatus.get("disponible") ?? 0, color: "#209d80" },
                      { label: "Anulados", value: ticketStatus.get("anulado") ?? 0, color: "#df7a5e" },
                      { label: "Vencidos", value: ticketStatus.get("vencido") ?? 0, color: "#f2c14e" },
                      { label: "Emitidos", value: ticketStatus.get("emitido") ?? 0, color: "#5ca8bc" },
                    ].filter((segment) => segment.value > 0)}
                    centerValue={totals.ticketTotal}
                    centerLabel="tiquetes"
                    size={132}
                  />
                </CardContent>
              </Card>

              <Card className="xl:col-span-3">
                <CardHeader>
                  <div>
                    <CardTitle>Reporte programado</CardTitle>
                    <p className="mt-0.5 text-[11px] text-muted">Envío automático a los responsables de la operación.</p>
                  </div>
                  <Badge variant={settings?.report_enabled ? "success" : "muted"}>{settings?.report_enabled ? "Activo" : "Inactivo"}</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Mail className="size-4" /></span>
                    <div>
                      <p className="text-[11px] font-bold text-ink">{settings?.report_schedule ?? "Diario"} · {settings?.report_hour?.slice(0, 5) ?? "18:00"}</p>
                      <p className="text-[10px] text-muted">{(settings?.report_recipients ?? []).join(", ") || "Sin destinatarios configurados"}</p>
                    </div>
                  </div>
                  <p className="max-w-md text-[10px] leading-relaxed text-muted">
                    La programación se guarda en la configuración de la empresa. La entrega se ejecuta con pg_cron y la función de reportes;
                    mientras tanto puedes exportar el CSV o imprimir el PDF.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {tab === "sedes" ? (
            <Card className="mt-4">
              <CardHeader>
                <div>
                  <CardTitle>Detalle por sede y comida</CardTitle>
                  <p className="mt-0.5 text-[11px] text-muted">Consumos, empleados únicos, offline y excepciones.</p>
                </div>
                <Badge variant="outline">{daily.length} filas</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] text-left text-xs">
                    <thead className="border-b border-line bg-paper/60 text-[10px] font-bold uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Sede</th>
                        <th className="px-4 py-3">Comida</th>
                        <th className="px-4 py-3">Consumos</th>
                        <th className="px-4 py-3">Empleados</th>
                        <th className="px-4 py-3">Offline</th>
                        <th className="px-4 py-3">Excepciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/70">
                      {daily.map((row, index) => (
                        <tr key={`${row.redemption_date}-${row.site_id}-${row.meal_type}-${index}`} className="hover:bg-paper/40">
                          <td className="px-4 py-2.5 font-semibold text-ink">{formatDate(row.redemption_date)}</td>
                          <td className="px-4 py-2.5">{row.site_name}</td>
                          <td className="px-4 py-2.5"><Badge variant={row.meal_type === "almuerzo" ? "default" : "warning"}>{MEAL_LABELS[row.meal_type]}</Badge></td>
                          <td className="px-4 py-2.5 font-extrabold text-ink">{row.total}</td>
                          <td className="px-4 py-2.5">{row.employees}</td>
                          <td className="px-4 py-2.5">{row.offline_total}</td>
                          <td className="px-4 py-2.5">{row.overrides}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {daily.length === 0 ? <EmptyState icon={<ClipboardList className="size-5" />} title="Sin filas para el filtro" /> : null}
              </CardContent>
            </Card>
          ) : null}

          {tab === "costos" ? (
            <Card className="mt-4">
              <CardHeader>
                <div>
                  <CardTitle>Consumos por centro de costo</CardTitle>
                  <p className="mt-0.5 text-[11px] text-muted">Base para la distribución interna del costo de alimentación.</p>
                </div>
                <Badge variant="outline">{byCostCenter.length} centros</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {byCostCenter.length === 0 ? (
                  <EmptyState icon={<BarChart3 className="size-5" />} title="Sin consumos asociados" description="Asigna centros de costo a los empleados para ver esta distribución." />
                ) : (
                  byCostCenter.map((center) => (
                    <div key={center.name}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-ink">{center.name}</p>
                        <p className="text-[11px] font-extrabold text-ink">{center.total} <span className="text-[9px] font-medium text-muted">({percent(center.total, totals.total)}%)</span></p>
                      </div>
                      <ProgressBar value={percent(center.total, totals.total)} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "tiquetes" ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <div>
                    <CardTitle>Tiquetes por estado</CardTitle>
                    <p className="mt-0.5 text-[11px] text-muted">Emitidos, disponibles, usados, vencidos y anulados.</p>
                  </div>
                  <Badge variant="outline">{totals.ticketTotal} tiquetes</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(["disponible", "usado", "emitido", "vencido", "anulado"] as TicketStatus[]).map((status) => {
                    const value = ticketStatus.get(status) ?? 0;
                    const share = percent(value, totals.ticketTotal);
                    return (
                      <div key={status}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <TicketStatusBadge status={status} />
                          <p className="text-[11px] font-extrabold text-ink">{value} <span className="text-[9px] font-medium text-muted">({share}%)</span></p>
                        </div>
                        <ProgressBar value={share} tone={status === "anulado" ? "clay" : status === "vencido" ? "citrus" : "brand"} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Resumen</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-[11px]">
                  <div className="rounded-xl bg-paper/50 px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Tiquetes usados</p>
                    <p className="mt-1 text-xl font-extrabold text-ink">{totals.usedTickets}</p>
                  </div>
                  <div className="rounded-xl bg-paper/50 px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Tasa de uso</p>
                    <p className="mt-1 text-xl font-extrabold text-ink">{percent(totals.usedTickets, totals.ticketTotal)}%</p>
                    <ProgressBar value={percent(totals.usedTickets, totals.ticketTotal)} className="mt-2" />
                  </div>
                  <p className="text-[10px] leading-relaxed text-muted">Un tiquete usado queda bloqueado de forma atómica; un intento duplicado se rechaza y se registra como evento de seguridad.</p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {tab === "excepciones" ? (
            <Card className="mt-4">
              <CardHeader>
                <div>
                  <CardTitle>Excepciones y fraudes</CardTitle>
                  <p className="mt-0.5 text-[11px] text-muted">Consumos offline, autorizaciones manuales y validaciones con PIN.</p>
                </div>
                <Badge variant="warning">{visibleExceptions.length} eventos</Badge>
              </CardHeader>
              <CardContent className="p-0">
                {visibleExceptions.length === 0 ? (
                  <EmptyState icon={<ShieldAlert className="size-5" />} title="Sin excepciones en el periodo" description="Los consumos normales por QR no aparecen en esta bandeja." />
                ) : (
                  <div className="divide-y divide-line/70">
                    {visibleExceptions.map((row) => (
                      <div key={row.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-citrus-100 text-[#8a6110]"><AlertTriangle className="size-4" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-[11px] font-bold text-ink">{row.full_name}</p>
                            <Badge variant="warning">{EXCEPTION_LABELS[row.exception_type] ?? row.exception_type}</Badge>
                            <Badge variant="muted">{MEAL_LABELS[row.meal_type]}</Badge>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted">{row.code} · {row.site_name} · {formatDate(row.redemption_date)}</p>
                          {row.detail ? <p className="mt-1 text-[10px] leading-relaxed text-muted">{row.detail}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "cocina" ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Conciliaciones" value={kitchen.length} hint="Registros en el periodo" icon={<ChefHat className="size-5" />} />
                <StatCard label="Diferencia acumulada" value={kitchenDiff} hint="Preparado vs. servido" icon={<TrendingUp className="size-5" />} tone={kitchenDiff > 0 ? "clay" : "brand"} />
                <StatCard label="Comidas servidas" value={kitchen.reduce((sum, row) => sum + Number(row.meals_served), 0)} hint="Según cocina" icon={<UtensilsCrossed className="size-5" />} tone="sky" />
              </div>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Conciliación de cocina</CardTitle>
                    <p className="mt-0.5 text-[11px] text-muted">Compara lo preparado con lo efectivamente servido.</p>
                  </div>
                  {canEditKitchen ? <Button size="sm" icon={<Plus className="size-3.5" />} onClick={openKitchen}>Registrar</Button> : null}
                </CardHeader>
                <CardContent className="p-0">
                  {kitchen.length === 0 ? (
                    <EmptyState icon={<ChefHat className="size-5" />} title="Aún no hay conciliaciones" description="Registra las comidas preparadas por sede y comida para comparar con los consumos validados." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[44rem] text-left text-xs">
                        <thead className="border-b border-line bg-paper/60 text-[10px] font-bold uppercase tracking-wider text-muted">
                          <tr>
                            <th className="px-4 py-3">Fecha</th>
                            <th className="px-4 py-3">Sede</th>
                            <th className="px-4 py-3">Comida</th>
                            <th className="px-4 py-3">Preparados</th>
                            <th className="px-4 py-3">Servidos</th>
                            <th className="px-4 py-3">Diferencia</th>
                            <th className="px-4 py-3">Notas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/70">
                          {kitchen.map((row) => (
                            <tr key={row.id} className="hover:bg-paper/40">
                              <td className="px-4 py-2.5 font-semibold text-ink">{formatDate(row.reconciliation_date)}</td>
                              <td className="px-4 py-2.5">{row.site_name}</td>
                              <td className="px-4 py-2.5"><Badge variant={row.meal_type === "almuerzo" ? "default" : "warning"}>{MEAL_LABELS[row.meal_type]}</Badge></td>
                              <td className="px-4 py-2.5">{row.meals_prepared}</td>
                              <td className="px-4 py-2.5">{row.meals_served}</td>
                              <td className="px-4 py-2.5">
                                <Badge variant={Number(row.difference) === 0 ? "success" : Number(row.difference) > 0 ? "warning" : "danger"}>
                                  {Number(row.difference) > 0 ? "+" : ""}{row.difference}
                                </Badge>
                              </td>
                              <td className="max-w-[14rem] truncate px-4 py-2.5 text-muted">{row.notes ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={kitchenOpen}
        onClose={() => setKitchenOpen(false)}
        title="Registrar conciliación de cocina"
        description="Ingresa las comidas preparadas y servidas. La diferencia se calcula automáticamente."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setKitchenOpen(false)}>Cancelar</Button>
            <Button onClick={() => void saveKitchen()} loading={savingKitchen} icon={<ChefHat className="size-4" />}>Guardar conciliación</Button>
          </>
        }
      >
        {kitchenError ? <Alert variant="danger" className="mb-4">{kitchenError}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sede *">
            <Select value={kitchenForm.site_id} onChange={(event) => setKitchenForm({ ...kitchenForm, site_id: event.target.value })}>
              <option value="">Selecciona</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </Select>
          </Field>
          <Field label="Fecha *">
            <Input type="date" value={kitchenForm.reconciliation_date} onChange={(event) => setKitchenForm({ ...kitchenForm, reconciliation_date: event.target.value })} />
          </Field>
          <Field label="Comida *">
            <Select value={kitchenForm.meal_type} onChange={(event) => setKitchenForm({ ...kitchenForm, meal_type: event.target.value as MealType })}>
              <option value="almuerzo">Almuerzo</option>
              <option value="merienda">Merienda</option>
            </Select>
          </Field>
          <Field label="Comidas preparadas *">
            <Input type="number" min={0} value={kitchenForm.meals_prepared} onChange={(event) => setKitchenForm({ ...kitchenForm, meals_prepared: event.target.value })} />
          </Field>
          <Field label="Comidas servidas *">
            <Input type="number" min={0} value={kitchenForm.meals_served} onChange={(event) => setKitchenForm({ ...kitchenForm, meals_served: event.target.value })} />
          </Field>
          <div className="rounded-xl border border-line bg-paper/40 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Diferencia estimada</p>
            <p className="mt-1 text-lg font-extrabold text-ink">
              {Number(kitchenForm.meals_prepared || 0) - Number(kitchenForm.meals_served || 0)}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notas">
              <Textarea value={kitchenForm.notes} onChange={(event) => setKitchenForm({ ...kitchenForm, notes: event.target.value })} placeholder="Observaciones de cocina, mermas, invitados, etc." />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
