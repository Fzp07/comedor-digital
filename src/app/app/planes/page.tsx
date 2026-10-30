"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Check,
  ChefHat,
  Clock3,
  Pencil,
  Plus,
  Power,
  Search,
  Users,
  UtensilsCrossed,
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
  SearchInput,
  Select,
  Skeleton,
  Textarea,
  Toggle,
} from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { supabase } from "@/lib/supabase";
import type { MealPlan, MealType, Site } from "@/lib/types";
import { currencyCOP, DAY_LABELS, formatDate, MEAL_LABELS } from "@/lib/utils";

interface PlanForm {
  id?: string;
  name: string;
  description: string;
  meal_type: MealType;
  meals_per_day: number;
  days_allowed: number[];
  valid_from: string;
  valid_to: string;
  price_cop: string;
  active: boolean;
}

const EMPTY_PLAN: PlanForm = {
  name: "",
  description: "",
  meal_type: "almuerzo",
  meals_per_day: 1,
  days_allowed: [1, 2, 3, 4, 5],
  valid_from: "",
  valid_to: "",
  price_cop: "0",
  active: true,
};

interface AssignmentRow {
  employee_id: string;
  code: string;
  full_name: string;
  site_id: string;
  site_name: string;
  status: string;
}

export default function PlansPage() {
  return (
    <RoleGate roles={["admin", "rrhh"]}>
      <PlansContent />
    </RoleGate>
  );
}

function PlansContent() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [assignments, setAssignments] = useState<Array<{ plan_id: string; employee_id: string; site_id: string }>>([]);
  const [employees, setEmployees] = useState<AssignmentRow[]>([]);
  const [redemptionsToday, setRedemptionsToday] = useState<Array<{ plan_id: string | null; meal_type: MealType }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PlanForm>(EMPTY_PLAN);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPlan, setAssignPlan] = useState<MealPlan | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignSite, setAssignSite] = useState("todas");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const [plansResult, sitesResult, assignmentsResult, employeesResult, ticketsResult] = await Promise.all([
      supabase.from("meal_plans").select("*").order("active", { ascending: false }).order("name"),
      supabase.from("sites").select("*").eq("active", true).order("name"),
      supabase.from("employee_plans").select("plan_id,employee_id,site_id").eq("active", true),
      supabase.from("v_employee_directory").select("id,code,full_name,site_id,site_name,status").eq("status", "activo").order("full_name"),
      supabase.from("tickets").select("plan_id,meal_type").eq("service_date", today),
    ]);

    if (plansResult.error) {
      setError(plansResult.error.message);
      setLoading(false);
      return;
    }
    setError(null);
    setPlans((plansResult.data ?? []) as MealPlan[]);
    setSites((sitesResult.data ?? []) as Site[]);
    setAssignments((assignmentsResult.data ?? []) as Array<{ plan_id: string; employee_id: string; site_id: string }>);
    setEmployees(
      ((employeesResult.data ?? []) as Array<{ id: string; code: string; full_name: string; site_id: string; site_name: string; status: string }>).map((row) => ({
        employee_id: row.id,
        code: row.code,
        full_name: row.full_name,
        site_id: row.site_id,
        site_name: row.site_name,
        status: row.status,
      })),
    );
    setRedemptionsToday((ticketsResult.data ?? []) as Array<{ plan_id: string | null; meal_type: MealType }>);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setForm(EMPTY_PLAN);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(plan: MealPlan) {
    setForm({
      id: plan.id,
      name: plan.name,
      description: plan.description ?? "",
      meal_type: plan.meal_type,
      meals_per_day: plan.meals_per_day,
      days_allowed: plan.days_allowed ?? [1, 2, 3, 4, 5],
      valid_from: plan.valid_from ?? "",
      valid_to: plan.valid_to ?? "",
      price_cop: String(plan.price_cop),
      active: plan.active,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function savePlan() {
    if (!form.name.trim()) return setFormError("El nombre del plan es obligatorio.");
    setSaving(true);
    setFormError(null);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      meal_type: form.meal_type,
      meals_per_day: Number(form.meals_per_day),
      days_allowed: form.days_allowed,
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
      price_cop: Number(form.price_cop || 0),
      active: form.active,
    };
    const query = form.id
      ? supabase.from("meal_plans").update(payload).eq("id", form.id)
      : supabase.from("meal_plans").insert({ ...payload, created_by: profile?.id });
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) {
      setFormError(saveError.message);
      return;
    }
    toast({ title: form.id ? "Plan actualizado" : "Plan creado", description: `${payload.name} ya está disponible.`, variant: "success" });
    setModalOpen(false);
    await load();
  }

  async function toggleActive(plan: MealPlan) {
    const { error: toggleError } = await supabase.from("meal_plans").update({ active: !plan.active }).eq("id", plan.id);
    if (toggleError) {
      toast({ title: "No pudimos cambiar el estado", description: toggleError.message, variant: "error" });
      return;
    }
    toast({ title: plan.active ? "Plan desactivado" : "Plan activado", variant: "info" });
    await load();
  }

  function openAssign(plan: MealPlan) {
    setAssignPlan(plan);
    setAssignSearch("");
    setAssignSite("todas");
    setSelectedEmployees([]);
    setAssignOpen(true);
  }

  const alreadyAssigned = useMemo(() => {
    if (!assignPlan) return new Set<string>();
    return new Set(assignments.filter((item) => item.plan_id === assignPlan.id).map((item) => item.employee_id));
  }, [assignPlan, assignments]);

  const assignable = useMemo(() => {
    const term = assignSearch.trim().toLowerCase();
    return employees.filter((employee) => {
      if (assignSite !== "todas" && employee.site_id !== assignSite) return false;
      if (!term) return true;
      return `${employee.full_name} ${employee.code}`.toLowerCase().includes(term);
    });
  }, [employees, assignSearch, assignSite]);

  async function saveAssignment() {
    if (!assignPlan) return;
    const ids = selectedEmployees.filter((id) => !alreadyAssigned.has(id));
    if (ids.length === 0) {
      setAssignOpen(false);
      return;
    }
    setAssigning(true);
    const { error: assignError } = await supabase.from("employee_plans").insert(
      ids.map((employeeId) => {
        const employee = employees.find((item) => item.employee_id === employeeId);
        return {
          employee_id: employeeId,
          plan_id: assignPlan.id,
          site_id: employee?.site_id,
          start_date: new Date().toISOString().slice(0, 10),
          active: true,
          assigned_by: profile?.id,
        };
      }),
    );
    setAssigning(false);
    if (assignError) {
      toast({ title: "No pudimos asignar el plan", description: assignError.message, variant: "error" });
      return;
    }
    toast({ title: "Plan asignado", description: `${ids.length} empleados recibieron ${assignPlan.name}.`, variant: "success" });
    setAssignOpen(false);
    await load();
  }

  function toggleDay(day: number) {
    setForm((current) => ({
      ...current,
      days_allowed: current.days_allowed.includes(day)
        ? current.days_allowed.filter((item) => item !== day)
        : [...current.days_allowed, day].sort(),
    }));
  }

  const activePlans = plans.filter((plan) => plan.active);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Gestión de alimentación"
        title="Planes y cupos"
        description="Define los planes de almuerzo y merienda, sus días de servicio, el valor y los empleados que los tienen asignados."
        actions={<Button icon={<Plus className="size-4" />} onClick={openCreate}>Nuevo plan</Button>}
      />

      {error ? <Alert variant="danger" title="No pudimos cargar los planes">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Planes activos</p>
          <p className="mt-2 text-2xl font-extrabold text-ink">{activePlans.length}</p>
          <p className="mt-1 text-[11px] text-muted">{plans.length} planes en total</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Asignaciones vigentes</p>
          <p className="mt-2 text-2xl font-extrabold text-ink">{assignments.length}</p>
          <p className="mt-1 text-[11px] text-muted">Empleado × plan activos</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Tiquetes emitidos hoy</p>
          <p className="mt-2 text-2xl font-extrabold text-ink">{redemptionsToday.length}</p>
          <p className="mt-1 text-[11px] text-muted">Según plan y tipo de comida</p>
        </Card>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-64" />)}
        </div>
      ) : plans.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<UtensilsCrossed className="size-5" />}
            title="Aún no hay planes"
            description="Crea el primer plan de alimentación para poder emitir tiquetes."
            action={<Button icon={<Plus className="size-4" />} onClick={openCreate}>Crear plan</Button>}
          />
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const assigned = assignments.filter((item) => item.plan_id === plan.id);
            const planEmployees = assigned.length;
            const todayTickets = redemptionsToday.filter((ticket) => ticket.plan_id === plan.id).length;
            const coverage = planEmployees > 0 ? Math.min(100, Math.round((todayTickets / planEmployees) * 100)) : 0;
            return (
              <Card key={plan.id} className={!plan.active ? "opacity-70" : ""}>
                <CardHeader>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={plan.meal_type === "almuerzo" ? "default" : "warning"}>{MEAL_LABELS[plan.meal_type]}</Badge>
                      <Badge variant={plan.active ? "success" : "muted"}>{plan.active ? "Activo" : "Inactivo"}</Badge>
                    </div>
                    <CardTitle className="mt-2 text-base">{plan.name}</CardTitle>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{plan.description ?? "Sin descripción"}</p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <ChefHat className="size-5" />
                  </span>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-paper/60 px-2.5 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-muted">Cupo diario</p>
                      <p className="mt-0.5 font-bold text-ink">{plan.meals_per_day} {plan.meals_per_day === 1 ? "comida" : "comidas"}</p>
                    </div>
                    <div className="rounded-lg bg-paper/60 px-2.5 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-muted">Valor</p>
                      <p className="mt-0.5 font-bold text-ink">{currencyCOP(plan.price_cop)}</p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-muted">
                      <CalendarRange className="size-3.5" /> Días de servicio
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                        <span
                          key={day}
                          className={`inline-flex size-6 items-center justify-center rounded-md text-[9px] font-bold ${
                            plan.days_allowed?.includes(day) ? "bg-brand-100 text-brand-800" : "bg-paper-deep text-muted/60"
                          }`}
                        >
                          {DAY_LABELS[day].slice(0, 1)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between text-[10px]">
                      <span className="font-bold text-muted">Cobertura de hoy</span>
                      <span className="font-bold text-ink">{todayTickets} / {planEmployees}</span>
                    </div>
                    <ProgressBar value={coverage} tone={coverage > 85 ? "clay" : "brand"} />
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-line/70 pt-3 text-[10px] text-muted">
                    <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {planEmployees} empleados</span>
                    <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" /> {plan.valid_from ? formatDate(plan.valid_from) : "Sin inicio"}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" icon={<Users className="size-3.5" />} onClick={() => openAssign(plan)}>
                      Asignar
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => openEdit(plan)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Power className="size-3.5" />} onClick={() => void toggleActive(plan)} className="ml-auto">
                      {plan.active ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Editar plan" : "Nuevo plan de alimentación"}
        description="Los planes definen el cupo y los días en que se puede consumir."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => void savePlan()} loading={saving}>{form.id ? "Guardar plan" : "Crear plan"}</Button>
          </>
        }
      >
        {formError ? <Alert variant="danger" className="mb-4">{formError}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nombre del plan *">
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Almuerzo Estándar" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Descripción">
              <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Qué incluye el plan, restricciones, observaciones…" />
            </Field>
          </div>
          <Field label="Tipo de comida *">
            <Select value={form.meal_type} onChange={(event) => setForm({ ...form, meal_type: event.target.value as MealType })}>
              <option value="almuerzo">Almuerzo</option>
              <option value="merienda">Merienda</option>
            </Select>
          </Field>
          <Field label="Cupo por día *" hint="Cantidad máxima de consumos diarios de este tipo.">
            <Select value={String(form.meals_per_day)} onChange={(event) => setForm({ ...form, meals_per_day: Number(event.target.value) })}>
              <option value="1">1 por día</option>
              <option value="2">2 por día</option>
              <option value="3">3 por día</option>
            </Select>
          </Field>
          <Field label="Vigente desde">
            <Input type="date" value={form.valid_from} onChange={(event) => setForm({ ...form, valid_from: event.target.value })} />
          </Field>
          <Field label="Vigente hasta">
            <Input type="date" value={form.valid_to} onChange={(event) => setForm({ ...form, valid_to: event.target.value })} />
          </Field>
          <Field label="Valor por comida (COP)">
            <Input type="number" min={0} step={100} value={form.price_cop} onChange={(event) => setForm({ ...form, price_cop: event.target.value })} />
          </Field>
          <div className="flex items-end">
            <div className="w-full rounded-xl border border-line bg-white px-3.5 py-3">
              <Toggle checked={form.active} onChange={(value) => setForm({ ...form, active: value })} label="Plan activo" description="Disponible para asignación y emisión." />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-ink">Días permitidos</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const selected = form.days_allowed.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition ${
                    selected ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-white text-muted hover:border-brand-200"
                  }`}
                >
                  {selected ? <Check className="size-3" /> : null}
                  {DAY_LABELS[day]}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Asignar ${assignPlan?.name ?? "plan"}`}
        description="Selecciona los empleados que recibirán este plan. Los que ya lo tienen aparecen marcados."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancelar</Button>
            <Button onClick={() => void saveAssignment()} loading={assigning} disabled={selectedEmployees.length === 0}>
              Asignar {selectedEmployees.length > 0 ? `${selectedEmployees.length} empleados` : ""}
            </Button>
          </>
        }
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <SearchInput value={assignSearch} onChange={setAssignSearch} placeholder="Buscar empleado…" className="flex-1" />
          <Select value={assignSite} onChange={(event) => setAssignSite(event.target.value)} className="sm:w-52">
            <option value="todas">Todas las sedes</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </Select>
        </div>

        <div className="scrollbar-thin max-h-[24rem] overflow-y-auto rounded-xl border border-line">
          {assignable.length === 0 ? (
            <EmptyState icon={<Search className="size-5" />} title="Sin empleados para asignar" />
          ) : (
            assignable.map((employee) => {
              const assigned = alreadyAssigned.has(employee.employee_id);
              const selected = assigned || selectedEmployees.includes(employee.employee_id);
              return (
                <button
                  key={employee.employee_id}
                  type="button"
                  disabled={assigned}
                  onClick={() =>
                    setSelectedEmployees((current) =>
                      current.includes(employee.employee_id)
                        ? current.filter((id) => id !== employee.employee_id)
                        : [...current, employee.employee_id],
                    )
                  }
                  className={`flex w-full items-center gap-3 border-b border-line/60 px-3 py-2.5 text-left last:border-0 ${
                    assigned ? "bg-brand-50/60" : "bg-white hover:bg-paper/60"
                  }`}
                >
                  <span className={`flex size-4 items-center justify-center rounded border ${selected ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong"}`}>
                    {selected ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-bold text-ink">{employee.full_name}</span>
                    <span className="block text-[10px] text-muted">{employee.code} · {employee.site_name}</span>
                  </span>
                  {assigned ? <Badge variant="success">Ya asignado</Badge> : null}
                </button>
              );
            })
          )}
        </div>
      </Modal>
    </div>
  );
}
