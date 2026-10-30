"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  Download,
  Filter,
  Plus,
  RefreshCw,
  ScanLine,
  Ticket as TicketIcon,
  Users,
} from "lucide-react";
import { RoleGate } from "@/components/app-shell";
import {
  Alert,
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
  SearchInput,
  Select,
  Skeleton,
  Tabs,
  TicketStatusBadge,
} from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { supabase } from "@/lib/supabase";
import type { MealType, Site, Ticket } from "@/lib/types";
import { downloadCsv, formatDate, MEAL_LABELS, todayISO, TICKET_STATUS_LABELS } from "@/lib/utils";

interface TicketRow extends Omit<Ticket, "employees" | "sites"> {
  employees?: { full_name: string; code: string; photo_url: string | null } | null;
  sites?: { name: string } | null;
}

interface DirectoryRow {
  id: string;
  code: string;
  full_name: string;
  site_id: string;
  site_name: string;
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "disponible", label: "Disponibles" },
  { value: "usado", label: "Usados" },
  { value: "anulado", label: "Anulados" },
  { value: "vencido", label: "Vencidos" },
];

export default function TicketsPage() {
  return (
    <RoleGate roles={["admin", "rrhh", "supervisor"]}>
      <TicketsContent />
    </RoleGate>
  );
}

function TicketsContent() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const canIssue = profile?.role === "admin" || profile?.role === "rrhh";
  const canCancel = profile?.role === "admin" || profile?.role === "supervisor";

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [siteFilter, setSiteFilter] = useState("todas");
  const [mealFilter, setMealFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [search, setSearch] = useState("");

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueSite, setIssueSite] = useState("");
  const [issueMeal, setIssueMeal] = useState<MealType>("almuerzo");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [issueEmployees, setIssueEmployees] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueResult, setIssueResult] = useState<{ issued: number; skipped: number; errors: Array<{ employee: string; reason: string }> } | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTicket, setCancelTicket] = useState<TicketRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [ticketsResult, sitesResult, employeesResult] = await Promise.all([
      supabase
        .from("tickets")
        .select("*, employees(full_name,code,photo_url), sites(name)")
        .eq("service_date", date)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("sites").select("*").eq("active", true).order("name"),
      supabase.from("v_employee_directory").select("id,code,full_name,site_id,site_name").eq("status", "activo").order("full_name"),
    ]);

    if (ticketsResult.error) {
      setError(ticketsResult.error.message);
      setLoading(false);
      return;
    }
    setError(null);
    setTickets((ticketsResult.data ?? []) as unknown as TicketRow[]);
    setSites((sitesResult.data ?? []) as Site[]);
    setEmployees((employeesResult.data ?? []) as DirectoryRow[]);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`tickets-${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [date, load]);

  useEffect(() => {
    if (!issueSite && sites.length > 0) setIssueSite(profile?.site_id ?? sites[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (siteFilter !== "todas" && ticket.site_id !== siteFilter) return false;
      if (mealFilter !== "todas" && ticket.meal_type !== mealFilter) return false;
      if (statusFilter !== "todos" && ticket.status !== statusFilter) return false;
      if (!term) return true;
      return [ticket.employees?.full_name, ticket.employees?.code, ticket.code, ticket.sites?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [tickets, siteFilter, mealFilter, statusFilter, search]);

  const counts = useMemo(() => {
    const base = { disponible: 0, usado: 0, anulado: 0, vencido: 0, emitido: 0 };
    for (const ticket of tickets) base[ticket.status] += 1;
    return base;
  }, [tickets]);

  const issueCandidates = useMemo(() => {
    const term = employeeSearch.trim().toLowerCase();
    return employees
      .filter((employee) => employee.site_id === issueSite)
      .filter((employee) => !term || `${employee.full_name} ${employee.code}`.toLowerCase().includes(term))
      .filter((employee) => {
        const existing = tickets.find(
          (ticket) =>
            ticket.employee_id === employee.id &&
            ticket.meal_type === issueMeal &&
            ticket.service_date === issueDate &&
            ["disponible", "emitido", "usado"].includes(ticket.status),
        );
        return !existing;
      });
  }, [employees, issueSite, issueMeal, issueDate, employeeSearch, tickets]);

  async function handleIssue() {
    setIssueError(null);
    setIssueResult(null);
    if (!issueSite) return setIssueError("Selecciona una sede.");
    if (issueDate < todayISO()) return setIssueError("No se pueden emitir tiquetes para fechas pasadas.");
    setIssuing(true);
    const { data, error: issueRpcError } = await supabase.rpc("issue_ticket_batch", {
      p_site_id: issueSite,
      p_meal_type: issueMeal,
      p_service_date: issueDate,
      p_employee_ids: issueEmployees.length > 0 ? issueEmployees : null,
      p_valid_from: null,
      p_valid_to: null,
    });
    setIssuing(false);
    if (issueRpcError) {
      setIssueError(issueRpcError.message);
      return;
    }
    const result = data as { issued: number; skipped: number; errors: Array<{ employee: string; reason: string }> };
    setIssueResult(result);
    await load();
    if (result.issued > 0) {
      toast({
        title: `${result.issued} tiquetes emitidos`,
        description: result.skipped > 0 ? `${result.skipped} empleados fueron omitidos.` : "Todos los tiquetes quedaron disponibles.",
        variant: "success",
      });
    } else {
      toast({ title: "No se emitió ningún tiquete", description: "Revisa los motivos del detalle.", variant: "warning" });
    }
  }

  function openCancel(ticket: TicketRow) {
    setCancelTicket(ticket);
    setCancelReason("");
    setCancelError(null);
    setCancelOpen(true);
  }

  async function handleCancel() {
    if (!cancelTicket) return;
    if (cancelReason.trim().length < 5) {
      setCancelError("Describe el motivo con al menos 5 caracteres.");
      return;
    }
    setCancelling(true);
    const { error: cancelRpcError } = await supabase.rpc("cancel_ticket", {
      p_ticket_id: cancelTicket.id,
      p_reason: cancelReason.trim(),
    });
    setCancelling(false);
    if (cancelRpcError) {
      setCancelError(cancelRpcError.message);
      return;
    }
    toast({ title: "Tiquete anulado", description: `${cancelTicket.employees?.full_name ?? "El tiquete"} quedó registrado en auditoría.`, variant: "success" });
    setCancelOpen(false);
    await load();
  }

  function handleExport() {
    downloadCsv(
      `tiquetes-${date}.csv`,
      filtered.map((ticket) => ({
        codigo: ticket.code,
        empleado: ticket.employees?.full_name ?? "",
        documento: ticket.employees?.code ?? "",
        sede: ticket.sites?.name ?? "",
        comida: MEAL_LABELS[ticket.meal_type],
        fecha: ticket.service_date,
        estado: TICKET_STATUS_LABELS[ticket.status],
        valido_desde: ticket.valid_from,
        valido_hasta: ticket.valid_to,
        usado_en: ticket.used_at ?? "",
      })),
      [
        { key: "codigo", label: "Código tiquete" },
        { key: "empleado", label: "Empleado" },
        { key: "documento", label: "Código empleado" },
        { key: "sede", label: "Sede" },
        { key: "comida", label: "Comida" },
        { key: "fecha", label: "Fecha" },
        { key: "estado", label: "Estado" },
        { key: "valido_desde", label: "Válido desde" },
        { key: "valido_hasta", label: "Válido hasta" },
        { key: "usado_en", label: "Usado en" },
      ],
    );
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Operación diaria"
        title="Tiquetes"
        description="Emite lotes, consulta el estado de cada tiquete y anula con motivo cuando sea necesario."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={handleExport}>Exportar</Button>
            {canIssue ? <Button icon={<Plus className="size-4" />} onClick={() => { setIssueOpen(true); setIssueResult(null); setIssueEmployees([]); }}>Emitir lote</Button> : null}
          </>
        }
      />

      {error ? <Alert variant="danger" title="No pudimos cargar los tiquetes">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {([
          { key: "disponible", label: "Disponibles", tone: "text-brand-700 bg-brand-50" },
          { key: "usado", label: "Usados", tone: "text-ink bg-paper-deep" },
          { key: "anulado", label: "Anulados", tone: "text-clay-500 bg-clay-100" },
          { key: "vencido", label: "Vencidos", tone: "text-[#8a6110] bg-citrus-100" },
          { key: "emitido", label: "Emitidos", tone: "text-[#235f70] bg-sky-100" },
        ] as Array<{ key: keyof typeof counts; label: string; tone: string }>).map((item) => (
          <Card key={item.key} className="flex items-center gap-3 p-4">
            <span className={`flex size-10 items-center justify-center rounded-xl ${item.tone}`}>
              <TicketIcon className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted">{item.label}</p>
              <p className="text-xl font-extrabold text-ink">{counts[item.key]}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-col items-stretch gap-3 xl:flex-row xl:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-auto pl-9" />
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
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar empleado o código…" className="w-full sm:w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Tabs tabs={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
            <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Recargar"><RefreshCw className="size-4" /></Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Filter className="size-5" />}
              title="Sin tiquetes para este filtro"
              description="Cambia la fecha o emite un nuevo lote para los empleados con plan activo."
              action={canIssue ? <Button icon={<Plus className="size-4" />} onClick={() => setIssueOpen(true)}>Emitir lote</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-xs">
                <thead className="border-b border-line bg-paper/60 text-[10px] font-bold uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3">Empleado</th>
                    <th className="px-4 py-3">Comida</th>
                    <th className="px-4 py-3">Sede</th>
                    <th className="px-4 py-3">Vigencia</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {filtered.map((ticket) => (
                    <tr key={ticket.id} className="transition hover:bg-paper/40">
                      <td className="px-4 py-3">
                        <p className="font-bold text-ink">{ticket.employees?.full_name ?? "Empleado"}</p>
                        <p className="text-[10px] text-muted">{ticket.employees?.code}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={ticket.meal_type === "almuerzo" ? "default" : "warning"}>{MEAL_LABELS[ticket.meal_type]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">{ticket.sites?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <p className="text-[10px] font-semibold text-ink">{formatDate(ticket.service_date)}</p>
                        <p className="text-[9px] text-muted">Hasta {new Date(ticket.valid_to).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}</p>
                      </td>
                      <td className="px-4 py-3"><TicketStatusBadge status={ticket.status} /></td>
                      <td className="px-4 py-3"><code className="rounded bg-paper-deep px-1.5 py-0.5 text-[9px] text-muted">{ticket.code.slice(0, 10)}…</code></td>
                      <td className="px-4 py-3 text-right">
                        {canCancel && ["emitido", "disponible"].includes(ticket.status) ? (
                          <Button variant="dangerSoft" size="sm" icon={<Ban className="size-3.5" />} onClick={() => openCancel(ticket)}>
                            Anular
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Emitir tiquetes"
        description="Se emite un tiquete por empleado y comida. La vigencia se toma del horario de servicio configurado."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIssueOpen(false)}>Cerrar</Button>
            <Button onClick={() => void handleIssue()} loading={issuing} icon={<TicketIcon className="size-4" />}>
              Emitir {issueEmployees.length > 0 ? `${issueEmployees.length} tiquetes` : "a todos"}
            </Button>
          </>
        }
      >
        {issueError ? <Alert variant="danger" className="mb-4">{issueError}</Alert> : null}
        {issueResult ? (
          <Alert variant={issueResult.issued > 0 ? "success" : "warning"} title={`${issueResult.issued} emitidos · ${issueResult.skipped} omitidos`} className="mb-4">
            {issueResult.errors.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {issueResult.errors.slice(0, 6).map((item, index) => <li key={index}>• {item.employee}: {item.reason}</li>)}
              </ul>
            ) : "Todos los empleados seleccionados recibieron su tiquete."}
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sede *">
            <Select value={issueSite} onChange={(event) => { setIssueSite(event.target.value); setIssueEmployees([]); }}>
              <option value="">Selecciona</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </Select>
          </Field>
          <Field label="Comida *">
            <Select value={issueMeal} onChange={(event) => { setIssueMeal(event.target.value as MealType); setIssueEmployees([]); }}>
              <option value="almuerzo">Almuerzo</option>
              <option value="merienda">Merienda</option>
            </Select>
          </Field>
          <Field label="Fecha de servicio *">
            <Input type="date" min={todayISO()} value={issueDate} onChange={(event) => { setIssueDate(event.target.value); setIssueEmployees([]); }} />
          </Field>
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-paper/40 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-ink">Destinatarios</p>
              <p className="text-[10px] text-muted">Si no seleccionas a nadie, se emite a todos los empleados activos con plan compatible.</p>
            </div>
            <Badge variant="outline"><Users className="size-3" /> {issueCandidates.length} candidatos</Badge>
          </div>
          <SearchInput value={employeeSearch} onChange={setEmployeeSearch} placeholder="Filtrar empleados…" className="mb-2" />
          <div className="scrollbar-thin max-h-60 overflow-y-auto rounded-xl border border-line bg-white">
            {issueCandidates.length === 0 ? (
              <p className="px-3 py-6 text-center text-[11px] text-muted">No hay candidatos sin tiquete para esta sede y comida.</p>
            ) : (
              issueCandidates.map((employee) => {
                const checked = issueEmployees.includes(employee.id);
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() =>
                      setIssueEmployees((current) =>
                        current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id],
                      )
                    }
                    className="flex w-full items-center gap-3 border-b border-line/60 px-3 py-2 text-left last:border-0 hover:bg-paper/50"
                  >
                    <span className={`flex size-4 items-center justify-center rounded border ${checked ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong"}`}>
                      {checked ? <ScanLine className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-bold text-ink">{employee.full_name}</span>
                      <span className="block text-[10px] text-muted">{employee.code}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Anular tiquete"
        description="La anulación queda registrada con tu usuario, fecha y motivo. No se puede anular un tiquete ya usado."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void handleCancel()} loading={cancelling} icon={<Ban className="size-4" />}>Anular tiquete</Button>
          </>
        }
      >
        {cancelError ? <Alert variant="danger" className="mb-4">{cancelError}</Alert> : null}
        <Alert variant="warning" className="mb-4" title="Estás anulando un tiquete">
          {cancelTicket?.employees?.full_name} · {cancelTicket ? MEAL_LABELS[cancelTicket.meal_type] : ""} · {cancelTicket ? formatDate(cancelTicket.service_date) : ""}
        </Alert>
        <Field label="Motivo de la anulación *" hint="Mínimo 5 caracteres. Apto para auditoría.">
          <Input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Ej. empleado retirado, duplicado por error de lote…" />
        </Field>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-citrus-100/60 px-3 py-2.5 text-[10px] leading-relaxed text-[#7a5a12]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>Si el empleado ya consumió, usa una compensación desde Historial en lugar de anular el tiquete.</span>
        </div>
      </Modal>
    </div>
  );
}
