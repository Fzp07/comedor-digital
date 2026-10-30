"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Download,
  Eye,
  History,
  RefreshCw,
  SearchX,
  ShieldCheck,
  Undo2,
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
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  RedemptionStatusBadge,
  SearchInput,
  Select,
  Skeleton,
  StatCard,
  Textarea,
} from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { supabase } from "@/lib/supabase";
import type { EmployeeWallet, MealType, RedemptionMethod, RedemptionStatus, Site } from "@/lib/types";
import {
  addDaysISO,
  downloadCsv,
  formatDate,
  formatDateTime,
  formatTime,
  MEAL_LABELS,
  METHOD_LABELS,
  todayISO,
} from "@/lib/utils";

interface HistoryRow {
  id: string;
  redemption_date: string;
  redeemed_at: string;
  meal_type: MealType;
  method: RedemptionMethod;
  status: RedemptionStatus;
  offline: boolean;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  photo_url: string | null;
  site_id: string;
  site_name: string;
  cost_center_name: string | null;
  operator_id: string | null;
  operator_name: string | null;
  ticket_code: string | null;
  override_id: string | null;
  notes: string | null;
}

const METHOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "todos", label: "Todos los métodos" },
  { value: "qr", label: "QR dinámico" },
  { value: "pin", label: "PIN" },
  { value: "huella", label: "Huella / passkey" },
  { value: "carnet", label: "Carné" },
  { value: "manual", label: "Manual" },
];

export default function HistoryPage() {
  return (
    <RoleGate roles={["admin", "rrhh", "operador", "supervisor", "auditor", "empleado"]}>
      <HistoryContent />
    </RoleGate>
  );
}

function HistoryContent() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const isEmployee = profile?.role === "empleado";
  const canCompensate = profile?.role === "admin" || profile?.role === "supervisor";

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [wallet, setWallet] = useState<EmployeeWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(addDaysISO(-30));
  const [dateTo, setDateTo] = useState(todayISO());
  const [siteFilter, setSiteFilter] = useState("todas");
  const [mealFilter, setMealFilter] = useState("todas");
  const [methodFilter, setMethodFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [search, setSearch] = useState("");

  const [detail, setDetail] = useState<HistoryRow | null>(null);
  const [compensating, setCompensating] = useState<HistoryRow | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    if (!isEmployee) return;
    const { data } = await supabase.rpc("get_employee_wallet");
    setWallet(data ? (data as EmployeeWallet) : null);
  }, [isEmployee]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isEmployee) {
      await loadWallet();
    }

    const { data: siteData } = await supabase.from("sites").select("*").eq("active", true).order("name");
    setSites((siteData ?? []) as Site[]);

    let query = supabase
      .from("v_redemption_detail")
      .select("*")
      .gte("redemption_date", dateFrom)
      .lte("redemption_date", dateTo)
      .order("redeemed_at", { ascending: false })
      .limit(2000);

    if (isEmployee) {
      const employeeId = wallet?.employee?.id;
      if (!employeeId) {
        setRows([]);
        setLoading(false);
        return;
      }
      query = query.eq("employee_id", employeeId);
    }

    if (siteFilter !== "todas") query = query.eq("site_id", siteFilter);
    if (mealFilter !== "todas") query = query.eq("meal_type", mealFilter);
    if (methodFilter !== "todos") query = query.eq("method", methodFilter);
    if (statusFilter !== "todos") query = query.eq("status", statusFilter);

    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as HistoryRow[]);
    setLoading(false);
  }, [dateFrom, dateTo, isEmployee, loadWallet, mealFilter, methodFilter, siteFilter, statusFilter, wallet?.employee?.id]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, siteFilter, mealFilter, methodFilter, statusFilter, wallet?.employee?.id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.employee_name, row.employee_code, row.site_name, row.operator_name, row.ticket_code, row.cost_center_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const valid = filtered.filter((row) => row.status === "valido");
    return {
      total: filtered.length,
      validos: valid.length,
      compensados: filtered.filter((row) => row.status === "compensado").length,
      offline: filtered.filter((row) => row.offline).length,
      excepciones: filtered.filter((row) => row.override_id).length,
      personas: new Set(filtered.map((row) => row.employee_id)).size,
    };
  }, [filtered]);

  function handleExport() {
    downloadCsv(
      `historial-${dateFrom}-a-${dateTo}.csv`,
      filtered.map((row) => ({
        fecha: row.redemption_date,
        hora: formatTime(row.redeemed_at),
        codigo: row.employee_code,
        empleado: row.employee_name,
        sede: row.site_name,
        centro_costo: row.cost_center_name ?? "",
        comida: MEAL_LABELS[row.meal_type],
        metodo: METHOD_LABELS[row.method],
        estado: row.status === "valido" ? "Válido" : "Compensado",
        operador: row.operator_name ?? "",
        tiquete: row.ticket_code ?? "",
        offline: row.offline ? "Sí" : "No",
        excepcion: row.override_id ? "Sí" : "No",
      })),
      [
        { key: "fecha", label: "Fecha" },
        { key: "hora", label: "Hora" },
        { key: "codigo", label: "Código empleado" },
        { key: "empleado", label: "Empleado" },
        { key: "sede", label: "Sede" },
        { key: "centro_costo", label: "Centro de costo" },
        { key: "comida", label: "Comida" },
        { key: "metodo", label: "Método" },
        { key: "estado", label: "Estado" },
        { key: "operador", label: "Operador" },
        { key: "tiquete", label: "Tiquete" },
        { key: "offline", label: "Offline" },
        { key: "excepcion", label: "Excepción" },
      ],
    );

    if (profile) {
      void supabase.from("report_exports").insert({
        user_id: profile.id,
        report_type: "historial",
        format: "csv",
        filters: { dateFrom, dateTo, siteFilter, mealFilter, methodFilter, statusFilter, search },
        status: "generado",
      });
    }
    toast({ title: "Exportación generada", description: `${filtered.length} registros exportados en CSV.`, variant: "success" });
  }

  function openCompensation(row: HistoryRow) {
    setCompensating(row);
    setReason("");
    setCompError(null);
  }

  async function submitCompensation() {
    if (!compensating) return;
    if (reason.trim().length < 10) {
      setCompError("Describe el motivo con al menos 10 caracteres.");
      return;
    }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("compensate_redemption", {
      p_redemption_id: compensating.id,
      p_reason: reason.trim(),
    });
    setSaving(false);
    if (rpcError) {
      setCompError(rpcError.message);
      return;
    }
    toast({
      title: "Consumo compensado",
      description: "El registro original se conserva y se agregó un evento de auditoría con tu usuario.",
      variant: "success",
    });
    setCompensating(null);
    setDetail(null);
    await load();
  }

  const employeeName = wallet?.employee?.full_name;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={isEmployee ? "Mi alimentación" : "Trazabilidad"}
        title={isEmployee ? "Mi historial de consumo" : "Historial de consumo"}
        description={
          isEmployee
            ? "Consulta cada almuerzo y merienda registrada en el comedor. Los registros no se pueden borrar."
            : "Registros inmutables de todas las validaciones. Usa compensaciones auditadas en lugar de borrar información."
        }
        actions={
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={handleExport} disabled={filtered.length === 0}>
            Exportar CSV
          </Button>
        }
      />

      {error ? <Alert variant="danger" title="No pudimos cargar el historial">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Consumos" value={stats.total} hint={isEmployee ? "En el periodo seleccionado" : `${stats.personas} empleados únicos`} icon={<History className="size-5" />} />
        <StatCard label="Válidos" value={stats.validos} hint="Sin compensaciones" icon={<ShieldCheck className="size-5" />} tone="brand" />
        <StatCard label="Compensados" value={stats.compensados} hint="Con evento de auditoría" icon={<Undo2 className="size-5" />} tone={stats.compensados ? "clay" : "sky"} />
        <StatCard label="Offline / excepciones" value={`${stats.offline} / ${stats.excepciones}`} hint="Sincronizados o autorizados" icon={<WifiOff className="size-5" />} tone={stats.offline + stats.excepciones ? "citrus" : "brand"} />
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-col items-stretch gap-3 xl:flex-row xl:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-muted" />
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-auto" aria-label="Desde" />
              <span className="text-[10px] text-muted">a</span>
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-auto" aria-label="Hasta" />
            </div>
            {!isEmployee ? (
              <Select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="w-auto">
                <option value="todas">Todas las sedes</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </Select>
            ) : null}
            <Select value={mealFilter} onChange={(event) => setMealFilter(event.target.value)} className="w-auto">
              <option value="todas">Todas las comidas</option>
              <option value="almuerzo">Almuerzo</option>
              <option value="merienda">Merienda</option>
            </Select>
            <Select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} className="w-auto">
              {METHOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-auto">
              <option value="todos">Todos los estados</option>
              <option value="valido">Válidos</option>
              <option value="compensado">Compensados</option>
            </Select>
            <SearchInput value={search} onChange={setSearch} placeholder={isEmployee ? "Buscar por fecha o comida…" : "Buscar empleado, operador o tiquete…"} className="w-full sm:w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{filtered.length} registros</Badge>
            <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Recargar"><RefreshCw className="size-4" /></Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-14" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-5" />}
              title="Sin consumos para este filtro"
              description={isEmployee ? "Cuando valides tu primer almuerzo o merienda aparecerá aquí." : "Ajusta el rango de fechas o los filtros para ver otros registros."}
              action={<Button variant="secondary" onClick={() => { setDateFrom(addDaysISO(-30)); setDateTo(todayISO()); setSiteFilter("todas"); setMealFilter("todas"); setMethodFilter("todos"); setStatusFilter("todos"); setSearch(""); }}>Limpiar filtros</Button>}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[64rem] text-left text-xs">
                  <thead className="border-b border-line bg-paper/60 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Fecha y hora</th>
                      <th className="px-4 py-3">Empleado</th>
                      <th className="px-4 py-3">Sede / centro de costo</th>
                      <th className="px-4 py-3">Comida</th>
                      <th className="px-4 py-3">Método</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Operador</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {filtered.map((row) => (
                      <tr key={row.id} className="transition hover:bg-paper/40">
                        <td className="px-4 py-3">
                          <p className="font-bold text-ink">{formatDate(row.redemption_date)}</p>
                          <p className="text-[10px] text-muted">{formatTime(row.redeemed_at)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={row.employee_name} src={row.photo_url} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-bold text-ink">{row.employee_name}</p>
                              <p className="text-[10px] text-muted">{row.employee_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">{row.site_name}</p>
                          <p className="text-[10px] text-muted">{row.cost_center_name ?? "Sin centro de costo"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={row.meal_type === "almuerzo" ? "default" : "warning"}>{MEAL_LABELS[row.meal_type]}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">{METHOD_LABELS[row.method]}</p>
                          {row.offline ? <Badge variant="warning" className="mt-1">Offline</Badge> : null}
                        </td>
                        <td className="px-4 py-3"><RedemptionStatusBadge status={row.status} /></td>
                        <td className="px-4 py-3 text-muted">{row.operator_name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" icon={<Eye className="size-3.5" />} onClick={() => setDetail(row)}>Ver</Button>
                            {canCompensate && row.status === "valido" ? (
                              <Button variant="dangerSoft" size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => openCompensation(row)}>Compensar</Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-line/70 lg:hidden">
                {filtered.map((row) => (
                  <div key={row.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Avatar name={row.employee_name} src={row.photo_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-ink">{row.employee_name}</p>
                            <p className="text-[9px] text-muted">{row.employee_code} · {row.site_name}</p>
                          </div>
                          <RedemptionStatusBadge status={row.status} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant={row.meal_type === "almuerzo" ? "default" : "warning"}>{MEAL_LABELS[row.meal_type]}</Badge>
                          <Badge variant="muted">{METHOD_LABELS[row.method]}</Badge>
                          {row.offline ? <Badge variant="warning">Offline</Badge> : null}
                          {row.override_id ? <Badge variant="danger">Excepción</Badge> : null}
                        </div>
                        <p className="mt-1 text-[9px] text-muted">{formatDate(row.redemption_date)} · {formatTime(row.redeemed_at)}</p>
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => setDetail(row)} className="text-[10px] font-bold text-brand-700 hover:underline">Ver detalle</button>
                          {canCompensate && row.status === "valido" ? (
                            <button type="button" onClick={() => openCompensation(row)} className="text-[10px] font-bold text-clay-500 hover:underline">Compensar</button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-[10px] leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <span>
          {isEmployee && employeeName ? `${employeeName}, tus` : "Los"} registros son inmutables. Una compensación no borra el consumo original:
          agrega un evento de auditoría con usuario, fecha y motivo, y ambos quedan disponibles para revisión.
        </span>
      </div>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Detalle del consumo"
        description="Información congelada al momento de la validación."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>Cerrar</Button>
            {canCompensate && detail?.status === "valido" ? (
              <Button variant="dangerSoft" icon={<Undo2 className="size-4" />} onClick={() => detail && openCompensation(detail)}>Compensar consumo</Button>
            ) : null}
          </>
        }
      >
        {detail ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper/40 p-4">
              <Avatar name={detail.employee_name} src={detail.photo_url} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-ink">{detail.employee_name}</p>
                <p className="text-[11px] text-muted">{detail.employee_code} · {detail.site_name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <RedemptionStatusBadge status={detail.status} />
                  {detail.offline ? <Badge variant="warning">Offline</Badge> : null}
                  {detail.override_id ? <Badge variant="danger">Excepción autorizada</Badge> : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                ["Fecha", formatDate(detail.redemption_date)],
                ["Hora", formatTime(detail.redeemed_at)],
                ["Comida", MEAL_LABELS[detail.meal_type]],
                ["Método", METHOD_LABELS[detail.method]],
                ["Centro de costo", detail.cost_center_name ?? "—"],
                ["Operador", detail.operator_name ?? "—"],
                ["Tiquete", detail.ticket_code ?? "Consumo directo"],
                ["Excepción", detail.override_id ? "Sí" : "No"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line/80 bg-white px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-muted">{label}</p>
                  <p className="mt-0.5 font-semibold text-ink">{value}</p>
                </div>
              ))}
            </div>

            {detail.notes ? (
              <div className="rounded-xl border border-line bg-paper/40 px-3 py-2.5 text-[11px] text-muted">
                <p className="font-bold text-ink">Notas</p>
                <p className="mt-1 whitespace-pre-wrap">{detail.notes}</p>
              </div>
            ) : null}

            <div className="flex items-start gap-2 rounded-xl bg-citrus-100/50 px-3 py-2.5 text-[10px] leading-relaxed text-[#7a5a12]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>El identificador de este registro es {detail.id}. No se puede editar ni eliminar; cualquier corrección se registra como compensación.</span>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(compensating)}
        onClose={() => setCompensating(null)}
        title="Compensar consumo"
        description="La compensación deja el registro original y agrega una trazabilidad de la corrección."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompensating(null)}>Cancelar</Button>
            <Button variant="danger" loading={saving} onClick={() => void submitCompensation()} icon={<Undo2 className="size-4" />}>Confirmar compensación</Button>
          </>
        }
      >
        {compError ? <Alert variant="danger" className="mb-4">{compError}</Alert> : null}
        {compensating ? (
          <>
            <Alert variant="warning" className="mb-4" title="Vas a compensar este consumo">
              {compensating.employee_name} · {MEAL_LABELS[compensating.meal_type]} · {formatDateTime(compensating.redeemed_at)}
            </Alert>
            <Field label="Motivo de la compensación *" hint="Mínimo 10 caracteres. Se conserva en la auditoría inmutable.">
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej. el empleado no consumió por incapacidad y el operador registró el consumo por error." />
            </Field>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-clay-100/60 px-3 py-2.5 text-[10px] leading-relaxed text-clay-500">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>Esta acción no elimina el registro. Requiere rol de administrador o supervisor y queda asociada a tu usuario.</span>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
