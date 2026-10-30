"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Download,
  Fingerprint,
  IdCard,
  Pencil,
  Plus,
  RefreshCw,
  SearchX,
  ShieldCheck,
  Upload,
  UserPlus,
  X,
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
  EmployeeStatusBadge,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  Toggle,
} from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { supabase } from "@/lib/supabase";
import type { CostCenter, Employee, EmployeeStatus, MealPlan, Site } from "@/lib/types";
import { downloadCsv, EMPLOYEE_STATUS_LABELS, formatDate } from "@/lib/utils";
import { EMPLOYEE_IMPORT_COLUMNS, parseCsv } from "@/lib/csv";

interface DirectoryRow {
  id: string;
  code: string;
  document_type: string;
  document_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  status: EmployeeStatus;
  photo_url: string | null;
  site_id: string;
  site_name: string;
  cost_center_id: string | null;
  cost_center_name: string | null;
  biometric_enrolled: boolean;
  consent_biometric: boolean;
  created_at: string;
  plans: string | null;
}

interface EmployeePlanRow {
  id: string;
  plan_id: string;
  active: boolean;
  meal_plans?: { name: string; meal_type: string } | null;
}

interface FormState {
  id?: string;
  code: string;
  document_type: string;
  document_number: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  site_id: string;
  cost_center_id: string;
  status: EmployeeStatus;
  hire_date: string;
  notes: string;
  pin: string;
  consent_data: boolean;
  plan_ids: string[];
}

const EMPTY_FORM: FormState = {
  code: "",
  document_type: "CC",
  document_number: "",
  full_name: "",
  email: "",
  phone: "",
  position: "",
  site_id: "",
  cost_center_id: "",
  status: "activo",
  hire_date: "",
  notes: "",
  pin: "",
  consent_data: true,
  plan_ids: [],
};

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "activo", label: "Activos" },
  { value: "suspendido", label: "Suspendidos" },
  { value: "retirado", label: "Retirados" },
];

function toForm(row: Employee, plans: EmployeePlanRow[]): FormState {
  return {
    id: row.id,
    code: row.code,
    document_type: row.document_type,
    document_number: row.document_number,
    full_name: row.full_name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    position: row.position ?? "",
    site_id: row.site_id,
    cost_center_id: row.cost_center_id ?? "",
    status: row.status,
    hire_date: row.hire_date ?? "",
    notes: row.notes ?? "",
    pin: "",
    consent_data: row.consent_data,
    plan_ids: plans.filter((item) => item.active).map((item) => item.plan_id),
  };
}

export default function EmployeesPage() {
  return (
    <RoleGate roles={["admin", "rrhh", "auditor"]}>
      <EmployeesContent />
    </RoleGate>
  );
}

function EmployeesContent() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const canManage = profile?.role === "admin" || profile?.role === "rrhh";

  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todos");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [currentPlans, setCurrentPlans] = useState<EmployeePlanRow[]>([]);

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [directory, sitesResult, centersResult, plansResult] = await Promise.all([
      supabase.from("v_employee_directory").select("*").order("full_name"),
      supabase.from("sites").select("*").eq("active", true).order("name"),
      supabase.from("cost_centers").select("*").eq("active", true).order("name"),
      supabase.from("meal_plans").select("*").eq("active", true).order("name"),
    ]);

    if (directory.error) {
      setError(directory.error.message);
      setLoading(false);
      return;
    }

    setError(null);
    setRows((directory.data ?? []) as DirectoryRow[]);
    setSites((sitesResult.data ?? []) as Site[]);
    setCenters((centersResult.data ?? []) as CostCenter[]);
    setPlans((plansResult.data ?? []) as MealPlan[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (siteFilter !== "todas" && row.site_id !== siteFilter) return false;
      if (statusFilter !== "todos" && row.status !== statusFilter) return false;
      if (!term) return true;
      return [row.full_name, row.code, row.document_number, row.email, row.position, row.site_name, row.plans]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [rows, search, siteFilter, statusFilter]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      activos: rows.filter((row) => row.status === "activo").length,
      biometric: rows.filter((row) => row.biometric_enrolled).length,
      sinPlan: rows.filter((row) => row.status === "activo" && !row.plans).length,
    }),
    [rows],
  );

  function openCreate() {
    const defaultSite = profile?.site_id ?? sites[0]?.id ?? "";
    setForm({ ...EMPTY_FORM, site_id: defaultSite });
    setCurrentPlans([]);
    setPhotoFile(null);
    setPhotoPreview(null);
    setFormError(null);
    setModalOpen(true);
  }

  async function openEdit(row: DirectoryRow) {
    setFormError(null);
    setPhotoFile(null);
    setPhotoPreview(row.photo_url);
    setModalOpen(true);

    const { data, error: loadError } = await supabase.from("employees").select("*").eq("id", row.id).single();
    if (loadError) {
      setFormError(loadError.message);
      return;
    }
    const { data: planData } = await supabase
      .from("employee_plans")
      .select("id,plan_id,active,meal_plans(name,meal_type)")
      .eq("employee_id", row.id);
    const planRows = (planData ?? []) as unknown as EmployeePlanRow[];
    setCurrentPlans(planRows);
    setForm(toForm(data as Employee, planRows));
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handlePhoto(file: File | null) {
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setFormError("La foto debe ser PNG, JPG o WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError("La foto no puede superar 5 MB.");
      return;
    }
    setFormError(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function uploadPhoto(employeeCode: string): Promise<string | null> {
    if (!photoFile) return null;
    const extension = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${employeeCode.replace(/[^a-zA-Z0-9-_]/g, "")}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("employee-photos")
      .upload(path, photoFile, { contentType: photoFile.type, upsert: false });
    if (uploadError) throw new Error(`No pudimos subir la foto: ${uploadError.message}`);
    const { data } = supabase.storage.from("employee-photos").getPublicUrl(path);
    return data.publicUrl;
  }

  async function syncPlans(employeeId: string) {
    const activeIds = new Set(currentPlans.filter((item) => item.active).map((item) => item.plan_id));
    const nextIds = new Set(form.plan_ids);

    const toDeactivate = currentPlans.filter((item) => item.active && !nextIds.has(item.plan_id));
    if (toDeactivate.length > 0) {
      const { error: deactivateError } = await supabase
        .from("employee_plans")
        .update({ active: false })
        .in("id", toDeactivate.map((item) => item.id));
      if (deactivateError) throw new Error(deactivateError.message);
    }

    const toActivate = currentPlans.filter((item) => !item.active && nextIds.has(item.plan_id));
    if (toActivate.length > 0) {
      const { error: activateError } = await supabase
        .from("employee_plans")
        .update({ active: true, site_id: form.site_id, end_date: null })
        .in("id", toActivate.map((item) => item.id));
      if (activateError) throw new Error(activateError.message);
    }

    const toInsert = form.plan_ids.filter((planId) => !currentPlans.some((item) => item.plan_id === planId));
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("employee_plans").insert(
        toInsert.map((planId) => ({
          employee_id: employeeId,
          plan_id: planId,
          site_id: form.site_id,
          start_date: new Date().toISOString().slice(0, 10),
          active: true,
          assigned_by: profile?.id,
        })),
      );
      if (insertError) throw new Error(insertError.message);
    }
    void activeIds;
  }

  async function handleSave() {
    setFormError(null);
    if (!form.full_name.trim()) return setFormError("El nombre completo es obligatorio.");
    if (!form.code.trim()) return setFormError("El código de empleado es obligatorio.");
    if (!form.document_number.trim()) return setFormError("El número de documento es obligatorio.");
    if (!form.site_id) return setFormError("Selecciona una sede.");

    setSaving(true);
    try {
      const photoUrl = await uploadPhoto(form.code);
      const payload = {
        code: form.code.trim().toUpperCase(),
        document_type: form.document_type,
        document_number: form.document_number.trim(),
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        position: form.position.trim() || null,
        site_id: form.site_id,
        cost_center_id: form.cost_center_id || null,
        status: form.status,
        hire_date: form.hire_date || null,
        notes: form.notes.trim() || null,
        consent_data: form.consent_data,
        ...(photoUrl ? { photo_url: photoUrl } : {}),
      };

      let employeeId = form.id;
      if (employeeId) {
        const { error: updateError } = await supabase.from("employees").update(payload).eq("id", employeeId);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { data, error: insertError } = await supabase
          .from("employees")
          .insert({ ...payload, created_by: profile?.id })
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);
        employeeId = data.id as string;
      }

      await syncPlans(employeeId);

      if (form.pin.trim()) {
        const { error: pinError } = await supabase.rpc("set_employee_pin", {
          p_employee_id: employeeId,
          p_pin: form.pin.trim(),
        });
        if (pinError) throw new Error(pinError.message);
      }

      if (form.consent_data) {
        const existing = await supabase
          .from("consents")
          .select("id")
          .eq("employee_id", employeeId)
          .eq("consent_type", "tratamiento_datos")
          .eq("granted", true)
          .limit(1);
        if (!existing.data?.length) {
          await supabase.rpc("record_consent", {
            p_employee_id: employeeId,
            p_type: "tratamiento_datos",
            p_granted: true,
            p_version: "1.0",
          });
        }
      }

      toast({
        title: form.id ? "Empleado actualizado" : "Empleado creado",
        description: `${payload.full_name} quedó registrado en ${sites.find((site) => site.id === form.site_id)?.name ?? "la sede"}.`,
        variant: "success",
      });
      setModalOpen(false);
      await load();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "No pudimos guardar el empleado.");
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    downloadCsv(
      `empleados-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((row) => ({
        codigo: row.code,
        documento: row.document_number,
        nombre: row.full_name,
        email: row.email ?? "",
        telefono: row.phone ?? "",
        cargo: row.position ?? "",
        sede: row.site_name,
        centro_costo: row.cost_center_name ?? "",
        estado: EMPLOYEE_STATUS_LABELS[row.status],
        planes: row.plans ?? "",
        biometrico: row.biometric_enrolled ? "Sí" : "No",
      })),
      [
        { key: "codigo", label: "Código" },
        { key: "documento", label: "Documento" },
        { key: "nombre", label: "Nombre" },
        { key: "email", label: "Correo" },
        { key: "telefono", label: "Teléfono" },
        { key: "cargo", label: "Cargo" },
        { key: "sede", label: "Sede" },
        { key: "centro_costo", label: "Centro de costo" },
        { key: "estado", label: "Estado" },
        { key: "planes", label: "Planes" },
        { key: "biometrico", label: "Biométrico" },
      ],
    );
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    setImportError(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.rows.length === 0) {
      setImportError("El archivo no contiene filas de datos.");
      return;
    }
    const required = ["codigo", "documento", "nombre", "sede"] as const;
    const missing = required.filter((key) => !parsed.headers.includes(key));
    if (missing.length > 0) {
      setImportError(`Faltan columnas obligatorias: ${missing.join(", ")}.`);
      return;
    }
    setImportHeaders(parsed.headers);
    setImportRows(parsed.rows);
  }

  function downloadTemplate() {
    downloadCsv(
      "plantilla-empleados.csv",
      [
        {
          codigo: "EMP-101",
          tipo_documento: "CC",
          documento: "1000000001",
          nombre: "Nombre Apellido",
          email: "nombre.apellido@empresa.com",
          telefono: "+57 300 000 0000",
          cargo: "Cargo",
          sede: "CENTRAL",
          centro_costo: "CC-ADM",
          estado: "activo",
        },
      ],
      EMPLOYEE_IMPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label })),
    );
  }

  async function runImport() {
    setImportError(null);
    setImporting(true);
    const existingCodes = new Set(rows.map((row) => row.code.toLowerCase()));
    const existingDocs = new Set(rows.map((row) => row.document_number));
    const existingEmails = new Set(rows.filter((row) => row.email).map((row) => row.email!.toLowerCase()));
    const seenCodes = new Set<string>();
    const seenDocs = new Set<string>();
    const errors: string[] = [];
    let inserted = 0;

    for (const [index, row] of importRows.entries()) {
      const fileLine = index + 2;
      const code = (row.codigo ?? "").trim().toUpperCase();
      const documentNumber = (row.documento ?? "").trim();
      const fullName = (row.nombre ?? "").trim();
      const siteToken = (row.sede ?? "").trim();
      const centerToken = (row.centro_costo ?? "").trim();

      if (!code || !documentNumber || !fullName || !siteToken) {
        errors.push(`Línea ${fileLine}: faltan campos obligatorios.`);
        continue;
      }
      if (existingCodes.has(code.toLowerCase()) || seenCodes.has(code.toLowerCase())) {
        errors.push(`Línea ${fileLine}: el código ${code} ya existe.`);
        continue;
      }
      if (existingDocs.has(documentNumber) || seenDocs.has(documentNumber)) {
        errors.push(`Línea ${fileLine}: el documento ${documentNumber} ya existe.`);
        continue;
      }
      const email = (row.email ?? "").trim().toLowerCase();
      if (email && existingEmails.has(email)) {
        errors.push(`Línea ${fileLine}: el correo ${email} ya está registrado.`);
        continue;
      }
      const site =
        sites.find((item) => item.code.toLowerCase() === siteToken.toLowerCase()) ??
        sites.find((item) => item.name.toLowerCase() === siteToken.toLowerCase());
      if (!site) {
        errors.push(`Línea ${fileLine}: sede "${siteToken}" no encontrada.`);
        continue;
      }
      const center = centerToken
        ? centers.find(
            (item) =>
              item.site_id === site.id &&
              (item.code.toLowerCase() === centerToken.toLowerCase() ||
                item.name.toLowerCase() === centerToken.toLowerCase()),
          )
        : undefined;

      const statusToken = (row.estado ?? "activo").trim().toLowerCase();
      const status: EmployeeStatus = ["activo", "suspendido", "retirado"].includes(statusToken)
        ? (statusToken as EmployeeStatus)
        : "activo";

      const { error: insertError } = await supabase.from("employees").insert({
        code,
        document_type: (row.tipo_documento || "CC").trim().toUpperCase(),
        document_number: documentNumber,
        full_name: fullName,
        email: email || null,
        phone: (row.telefono ?? "").trim() || null,
        position: (row.cargo ?? "").trim() || null,
        site_id: site.id,
        cost_center_id: center?.id ?? null,
        status,
        hire_date: new Date().toISOString().slice(0, 10),
        created_by: profile?.id,
      });

      if (insertError) {
        errors.push(`Línea ${fileLine}: ${insertError.message}`);
        continue;
      }
      existingCodes.add(code.toLowerCase());
      seenCodes.add(code.toLowerCase());
      existingDocs.add(documentNumber);
      seenDocs.add(documentNumber);
      if (email) existingEmails.add(email);
      inserted += 1;
    }

    setImporting(false);
    await load();
    if (errors.length > 0) {
      setImportError(`${inserted} empleados importados. ${errors.length} filas con problemas:\n${errors.slice(0, 12).join("\n")}${errors.length > 12 ? "\n…" : ""}`);
    } else {
      toast({ title: "Importación completada", description: `${inserted} empleados creados correctamente.`, variant: "success" });
      setImportOpen(false);
      setImportRows([]);
      setImportHeaders([]);
    }
  }

  const selectedSiteCenters = centers.filter((center) => center.site_id === form.site_id);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Gestión de personas"
        title="Empleados"
        description="Administra el padrón, los planes asignados, la foto de identificación y las credenciales de acceso al comedor."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={handleExport}>
              Exportar
            </Button>
            {canManage ? (
              <>
                <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>
                  Importar CSV
                </Button>
                <Button icon={<UserPlus className="size-4" />} onClick={openCreate}>
                  Nuevo empleado
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {error ? <Alert variant="danger" title="No pudimos cargar los empleados">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Total registrados</p>
          <p className="mt-2 text-2xl font-extrabold text-ink">{stats.total}</p>
          <p className="mt-1 text-[11px] text-muted">{stats.activos} activos hoy</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Con plan activo</p>
          <p className="mt-2 text-2xl font-extrabold text-ink">{stats.total - stats.sinPlan}</p>
          <p className="mt-1 text-[11px] text-muted">{stats.sinPlan} activos sin plan</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Huella / passkey</p>
          <p className="mt-2 text-2xl font-extrabold text-ink">{stats.biometric}</p>
          <p className="mt-1 text-[11px] text-muted">Credenciales WebAuthn</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Cobertura</p>
          <p className="mt-2 text-2xl font-extrabold text-ink">{stats.total ? Math.round(((stats.total - stats.sinPlan) / stats.total) * 100) : 0}%</p>
          <p className="mt-1 text-[11px] text-muted">Empleados con alimentación</p>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, código, documento…" className="w-full sm:w-72" />
            <Select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="w-auto">
              <option value="todas">Todas las sedes</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Tabs tabs={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} />
            <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Recargar">
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-5" />}
              title="No encontramos empleados"
              description={rows.length === 0 ? "Aún no hay personas registradas. Crea la primera o importa un archivo CSV." : "Prueba con otro término de búsqueda o cambia los filtros."}
              action={canManage && rows.length === 0 ? <Button icon={<Plus className="size-4" />} onClick={openCreate}>Crear empleado</Button> : undefined}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line bg-paper/60 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Empleado</th>
                      <th className="px-4 py-3">Documento</th>
                      <th className="px-4 py-3">Sede / centro de costo</th>
                      <th className="px-4 py-3">Planes</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Credenciales</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {filtered.map((row) => (
                      <tr key={row.id} className="transition hover:bg-paper/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={row.full_name} src={row.photo_url} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-bold text-ink">{row.full_name}</p>
                              <p className="text-[10px] text-muted">{row.code} · {row.position ?? "Sin cargo"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">{row.document_number}</p>
                          <p className="text-[10px] text-muted">{row.document_type}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">{row.site_name}</p>
                          <p className="text-[10px] text-muted">{row.cost_center_name ?? "Sin centro de costo"}</p>
                        </td>
                        <td className="px-4 py-3">
                          {row.plans ? (
                            <div className="flex max-w-[15rem] flex-wrap gap-1">
                              {row.plans.split(", ").map((plan) => <Badge key={plan} variant="muted">{plan}</Badge>)}
                            </div>
                          ) : (
                            <Badge variant="warning">Sin plan</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3"><EmployeeStatusBadge status={row.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted">
                            <span className={`inline-flex size-2 rounded-full ${row.biometric_enrolled ? "bg-brand-500" : "bg-line-strong"}`} />
                            {row.biometric_enrolled ? "Huella" : "QR / PIN"}
                          </div>
                          <p className="mt-1 text-[9px] text-muted/70">Alta {formatDate(row.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => void openEdit(row)}>
                            {canManage ? "Editar" : "Ver"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-line/70 lg:hidden">
                {filtered.map((row) => (
                  <div key={row.id} className="flex items-start gap-3 px-4 py-3">
                    <Avatar name={row.full_name} src={row.photo_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink">{row.full_name}</p>
                          <p className="text-[10px] text-muted">{row.code} · {row.document_number}</p>
                        </div>
                        <EmployeeStatusBadge status={row.status} />
                      </div>
                      <p className="mt-1 text-[10px] text-muted">{row.site_name} · {row.position ?? "Sin cargo"}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {row.plans ? row.plans.split(", ").map((plan) => <Badge key={plan} variant="muted">{plan}</Badge>) : <Badge variant="warning">Sin plan</Badge>}
                        {row.biometric_enrolled ? <Badge variant="success"><Fingerprint className="size-3" /> Huella</Badge> : null}
                      </div>
                      <button type="button" onClick={() => void openEdit(row)} className="mt-2 text-[10px] font-bold text-brand-700 hover:underline">
                        {canManage ? "Editar empleado" : "Ver detalle"} →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Editar empleado" : "Nuevo empleado"}
        description="Los cambios quedan registrados en la auditoría inmutable del sistema."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            {canManage ? (
              <Button onClick={() => void handleSave()} loading={saving}>{form.id ? "Guardar cambios" : "Crear empleado"}</Button>
            ) : null}
          </>
        }
      >
        {formError ? <Alert variant="danger" className="mb-4">{formError}</Alert> : null}

        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-line bg-paper/50 p-4">
          <Avatar name={form.full_name || "Nuevo"} src={photoPreview} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink">Foto de identificación</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted">Opcional. Se muestra al operador al validar el tiquete. PNG, JPG o WebP hasta 5 MB.</p>
            {canManage ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 text-[11px] font-semibold text-ink hover:border-brand-300">
                  <Upload className="size-3.5" /> Subir foto
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void handlePhoto(event.target.files?.[0] ?? null)} />
                </label>
                {photoPreview ? (
                  <button type="button" onClick={() => void handlePhoto(null)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-clay-500 hover:underline">
                    <X className="size-3" /> Quitar
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre completo *">
            <Input value={form.full_name} onChange={(event) => setField("full_name", event.target.value)} placeholder="Ana María Torres" disabled={!canManage} />
          </Field>
          <Field label="Código de empleado *">
            <Input value={form.code} onChange={(event) => setField("code", event.target.value.toUpperCase())} placeholder="EMP-101" disabled={!canManage} />
          </Field>
          <Field label="Tipo de documento *">
            <Select value={form.document_type} onChange={(event) => setField("document_type", event.target.value)} disabled={!canManage}>
              <option value="CC">Cédula de ciudadanía</option>
              <option value="CE">Cédula de extranjería</option>
              <option value="TI">Tarjeta de identidad</option>
              <option value="PA">Pasaporte</option>
              <option value="NIT">NIT</option>
            </Select>
          </Field>
          <Field label="Número de documento *">
            <Input value={form.document_number} onChange={(event) => setField("document_number", event.target.value)} placeholder="1023456789" disabled={!canManage} />
          </Field>
          <Field label="Correo corporativo">
            <Input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder="ana.torres@empresa.com" disabled={!canManage} />
          </Field>
          <Field label="Teléfono">
            <Input value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="+57 310 000 0000" disabled={!canManage} />
          </Field>
          <Field label="Cargo">
            <Input value={form.position} onChange={(event) => setField("position", event.target.value)} placeholder="Analista de calidad" disabled={!canManage} />
          </Field>
          <Field label="Sede *">
            <Select value={form.site_id} onChange={(event) => { setField("site_id", event.target.value); setField("cost_center_id", ""); }} disabled={!canManage}>
              <option value="">Selecciona una sede</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </Select>
          </Field>
          <Field label="Centro de costo">
            <Select value={form.cost_center_id} onChange={(event) => setField("cost_center_id", event.target.value)} disabled={!canManage || !form.site_id}>
              <option value="">Sin centro de costo</option>
              {selectedSiteCenters.map((center) => <option key={center.id} value={center.id}>{center.name} ({center.code})</option>)}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={form.status} onChange={(event) => setField("status", event.target.value as EmployeeStatus)} disabled={!canManage}>
              <option value="activo">Activo</option>
              <option value="suspendido">Suspendido</option>
              <option value="retirado">Retirado</option>
            </Select>
          </Field>
          <Field label="Fecha de ingreso">
            <Input type="date" value={form.hire_date} onChange={(event) => setField("hire_date", event.target.value)} disabled={!canManage} />
          </Field>
          <Field label="PIN de comedor" hint="4 a 6 dígitos. Se guarda con hash bcrypt.">
            <Input
              inputMode="numeric"
              maxLength={6}
              value={form.pin}
              onChange={(event) => setField("pin", event.target.value.replace(/\D/g, ""))}
              placeholder={form.id ? "Dejar vacío para conservar" : "Ej. 1234"}
              disabled={!canManage}
            />
          </Field>
        </div>

        {canManage ? (
          <div className="mt-5 rounded-2xl border border-line bg-paper/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-ink">Planes de alimentación</p>
                <p className="mt-0.5 text-[10px] text-muted">Define qué comidas puede consumir y con qué cupo.</p>
              </div>
              <Badge variant="outline">{form.plan_ids.length} asignados</Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {plans.map((plan) => {
                const checked = form.plan_ids.includes(plan.id);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setField("plan_ids", checked ? form.plan_ids.filter((id) => id !== plan.id) : [...form.plan_ids, plan.id])}
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${checked ? "border-brand-400 bg-brand-50" : "border-line bg-white hover:border-brand-200"}`}
                  >
                    <span className={`mt-0.5 flex size-4 items-center justify-center rounded border ${checked ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong"}`}>
                      {checked ? <BadgeCheck className="size-3" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold text-ink">{plan.name}</span>
                      <span className="block text-[10px] text-muted">
                        {plan.meal_type === "almuerzo" ? "Almuerzo" : "Merienda"} · {plan.meals_per_day}/día
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-white px-3.5 py-3">
            <Toggle
              checked={form.consent_data}
              onChange={(value) => setField("consent_data", value)}
              label="Consentimiento de datos"
              description="Autorización Ley 1581 registrada para el tratamiento."
              disabled={!canManage}
            />
          </div>
          <div className="rounded-xl border border-line bg-white px-3.5 py-3">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <ShieldCheck className="size-4 text-brand-600" />
              <span>Los cambios en empleados quedan auditados automáticamente.</span>
            </div>
          </div>
        </div>

        <Field label="Notas internas" >
          <Textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Observaciones de nómina, restricciones alimentarias, etc." disabled={!canManage} />
        </Field>

        {form.id && currentPlans.length > 0 ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-paper/60 px-3 py-2.5 text-[10px] text-muted">
            <IdCard className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
            <span>Historial de planes: {currentPlans.map((item) => item.meal_plans?.name ?? "Plan").join(", ")}. Los planes retirados se conservan para auditoría.</span>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => { setImportOpen(false); setImportRows([]); setImportHeaders([]); setImportError(null); }}
        title="Importar empleados"
        description="Carga un archivo CSV delimitado por coma, punto y coma o tabulación. Detectamos duplicados por código, documento y correo."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={downloadTemplate} icon={<Download className="size-4" />}>Descargar plantilla</Button>
            <Button onClick={() => void runImport()} loading={importing} disabled={importRows.length === 0} icon={<Upload className="size-4" />}>
              Importar {importRows.length > 0 ? `${importRows.length} filas` : ""}
            </Button>
          </>
        }
      >
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-paper/40 px-6 py-10 text-center transition hover:border-brand-300 hover:bg-brand-50/40"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <Upload className="size-5" />
          </span>
          <span className="text-sm font-bold text-ink">Selecciona el archivo CSV</span>
          <span className="text-[11px] text-muted">Máximo 2.000 filas · Codificación UTF-8</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv"
          className="sr-only"
          onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
        />

        {importError ? <Alert variant="warning" className="mt-4 whitespace-pre-wrap">{importError}</Alert> : null}

        {importRows.length > 0 ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold text-ink">Vista previa</p>
              <Badge variant="outline">{importRows.length} filas · {importHeaders.length} columnas</Badge>
            </div>
            <div className="scrollbar-thin max-h-72 overflow-auto rounded-xl border border-line">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-paper text-[9px] font-bold uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    {importHeaders.slice(0, 7).map((header) => <th key={header} className="px-3 py-2">{header}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60 bg-white">
                  {importRows.slice(0, 50).map((row, index) => (
                    <tr key={index}>
                      <td className="px-3 py-1.5 text-muted">{index + 2}</td>
                      {importHeaders.slice(0, 7).map((header) => (
                        <td key={header} className="max-w-[10rem] truncate px-3 py-1.5 text-ink">{row[header]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted">
              <CalendarDays className="size-3.5" /> Se importarán únicamente las columnas reconocidas. Las filas con errores se omiten y se reportan.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-line bg-white p-4">
            <p className="text-[11px] font-bold text-ink">Columnas esperadas</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EMPLOYEE_IMPORT_COLUMNS.map((column) => (
                <Badge key={column.key} variant={["codigo", "documento", "nombre", "sede"].includes(column.key) ? "default" : "muted"}>
                  {column.label}
                </Badge>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-[10px] leading-relaxed text-muted">
              <li>• <strong className="text-ink">Obligatorias:</strong> código, documento, nombre y sede (código o nombre exacto).</li>
              <li>• La sede debe existir previamente en Configuración → Sedes.</li>
              <li>• Si el centro de costo no coincide se deja vacío; no bloquea la importación.</li>
              <li>• Los duplicados por código, documento o correo se rechazan fila por fila.</li>
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
