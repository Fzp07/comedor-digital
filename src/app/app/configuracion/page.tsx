"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ChefHat,
  Clock3,
  CreditCard,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Store,
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
  Select,
  Skeleton,
  Tabs,
  Textarea,
  Toggle,
} from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { supabase } from "@/lib/supabase";
import type { CompanySettings, CostCenter, MealType, ServiceWindow, Site } from "@/lib/types";
import { DAY_LABELS, formatDate, MEAL_LABELS, todayISO } from "@/lib/utils";

interface MenuRow {
  id: string;
  site_id: string;
  menu_date: string;
  meal_type: MealType;
  title: string;
  description: string | null;
  calories: number | null;
  active: boolean;
  sites?: { name: string } | null;
}

interface SiteForm {
  id?: string;
  name: string;
  code: string;
  address: string;
  city: string;
  phone: string;
  manager_name: string;
  active: boolean;
}

interface CostForm {
  id?: string;
  site_id: string;
  name: string;
  code: string;
  active: boolean;
}

interface WindowForm {
  id?: string;
  site_id: string;
  meal_type: MealType;
  name: string;
  start_time: string;
  end_time: string;
  days_allowed: number[];
  active: boolean;
}

interface MenuForm {
  id?: string;
  site_id: string;
  menu_date: string;
  meal_type: MealType;
  title: string;
  description: string;
  calories: string;
  active: boolean;
}

const EMPTY_SITE: SiteForm = { name: "", code: "", address: "", city: "", phone: "", manager_name: "", active: true };
const EMPTY_COST: CostForm = { site_id: "", name: "", code: "", active: true };
const EMPTY_WINDOW: WindowForm = {
  site_id: "",
  meal_type: "almuerzo",
  name: "",
  start_time: "11:00",
  end_time: "14:00",
  days_allowed: [1, 2, 3, 4, 5],
  active: true,
};
const EMPTY_MENU: MenuForm = {
  site_id: "",
  menu_date: todayISO(),
  meal_type: "almuerzo",
  title: "",
  description: "",
  calories: "",
  active: true,
};

export default function SettingsPage() {
  return (
    <RoleGate roles={["admin"]}>
      <SettingsContent />
    </RoleGate>
  );
}

function SettingsContent() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("empresa");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [windows, setWindows] = useState<ServiceWindow[]>([]);
  const [menus, setMenus] = useState<MenuRow[]>([]);

  const [siteModal, setSiteModal] = useState(false);
  const [siteForm, setSiteForm] = useState<SiteForm>(EMPTY_SITE);
  const [siteError, setSiteError] = useState<string | null>(null);

  const [costModal, setCostModal] = useState(false);
  const [costForm, setCostForm] = useState<CostForm>(EMPTY_COST);
  const [costError, setCostError] = useState<string | null>(null);

  const [windowModal, setWindowModal] = useState(false);
  const [windowForm, setWindowForm] = useState<WindowForm>(EMPTY_WINDOW);
  const [windowError, setWindowError] = useState<string | null>(null);

  const [menuModal, setMenuModal] = useState(false);
  const [menuForm, setMenuForm] = useState<MenuForm>(EMPTY_MENU);
  const [menuError, setMenuError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsResult, sitesResult, centersResult, windowsResult, menusResult] = await Promise.all([
      supabase.from("company_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("sites").select("*").order("name"),
      supabase.from("cost_centers").select("*").order("name"),
      supabase.from("service_windows").select("*").order("start_time"),
      supabase.from("menus").select("id,site_id,menu_date,meal_type,title,description,calories,active,sites(name)").order("menu_date", { ascending: false }).limit(30),
    ]);

    const firstError = [settingsResult.error, sitesResult.error, centersResult.error, windowsResult.error, menusResult.error].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    setError(null);
    setSettings((settingsResult.data ?? null) as CompanySettings | null);
    setSites((sitesResult.data ?? []) as Site[]);
    setCenters((centersResult.data ?? []) as CostCenter[]);
    setWindows((windowsResult.data ?? []) as ServiceWindow[]);
    setMenus((menusResult.data ?? []) as unknown as MenuRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateSetting<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveSettings(section: string, payload: Record<string, unknown>) {
    setSaving(section);
    const { error: saveError } = await supabase.from("company_settings").update(payload).eq("id", true);
    setSaving(null);
    if (saveError) {
      toast({ title: "No pudimos guardar", description: saveError.message, variant: "error" });
      return false;
    }
    toast({ title: "Configuración actualizada", description: "Los cambios aplican de inmediato.", variant: "success" });
    return true;
  }

  async function saveCompany() {
    if (!settings) return;
    if (!settings.company_name.trim()) {
      toast({ title: "El nombre de la empresa es obligatorio", variant: "warning" });
      return;
    }
    await saveSettings("empresa", {
      company_name: settings.company_name.trim(),
      nit: settings.nit?.trim() || null,
      support_email: settings.support_email?.trim() || null,
      privacy_url: settings.privacy_url?.trim() || null,
      logo_url: settings.logo_url?.trim() || null,
      timezone: settings.timezone,
      currency: settings.currency,
      primary_color: settings.primary_color,
    });
  }

  async function saveSecurity() {
    if (!settings) return;
    if (settings.qr_ttl_seconds < 30 || settings.qr_ttl_seconds > 60) {
      toast({ title: "El QR debe vivir entre 30 y 60 segundos", variant: "warning" });
      return;
    }
    if (settings.ticket_validity_minutes < 15) {
      toast({ title: "La vigencia mínima del tiquete es 15 minutos", variant: "warning" });
      return;
    }
    await saveSettings("seguridad", {
      ticket_validity_minutes: settings.ticket_validity_minutes,
      qr_ttl_seconds: settings.qr_ttl_seconds,
      allow_offline: settings.allow_offline,
      offline_grace_minutes: settings.offline_grace_minutes,
      max_overrides_per_day: settings.max_overrides_per_day,
      require_device: settings.require_device,
      require_mfa: settings.require_mfa,
    });
  }

  async function saveReports() {
    if (!settings) return;
    await saveSettings("reportes", {
      report_enabled: settings.report_enabled,
      report_recipients: settings.report_recipients,
      report_schedule: settings.report_schedule,
      report_hour: settings.report_hour,
    });
  }

  function openSite(site?: Site) {
    setSiteForm(
      site
        ? {
            id: site.id,
            name: site.name,
            code: site.code,
            address: site.address ?? "",
            city: site.city ?? "",
            phone: site.phone ?? "",
            manager_name: site.manager_name ?? "",
            active: site.active,
          }
        : { ...EMPTY_SITE, code: `SEDE-${sites.length + 1}` },
    );
    setSiteError(null);
    setSiteModal(true);
  }

  async function saveSite() {
    if (!siteForm.name.trim() || !siteForm.code.trim()) {
      setSiteError("El nombre y el código de la sede son obligatorios.");
      return;
    }
    setSaving("sede");
    setSiteError(null);
    const payload = {
      name: siteForm.name.trim(),
      code: siteForm.code.trim().toUpperCase(),
      address: siteForm.address.trim() || null,
      city: siteForm.city.trim() || null,
      phone: siteForm.phone.trim() || null,
      manager_name: siteForm.manager_name.trim() || null,
      active: siteForm.active,
    };
    const { error: saveError } = siteForm.id
      ? await supabase.from("sites").update(payload).eq("id", siteForm.id)
      : await supabase.from("sites").insert(payload);
    setSaving(null);
    if (saveError) {
      setSiteError(saveError.message);
      return;
    }
    toast({ title: siteForm.id ? "Sede actualizada" : "Sede creada", description: payload.name, variant: "success" });
    setSiteModal(false);
    await load();
  }

  async function toggleSite(site: Site) {
    const { error: toggleError } = await supabase.from("sites").update({ active: !site.active }).eq("id", site.id);
    if (toggleError) {
      toast({ title: "No pudimos cambiar la sede", description: toggleError.message, variant: "error" });
      return;
    }
    await load();
    toast({ title: site.active ? "Sede desactivada" : "Sede activada", variant: "info" });
  }

  function openCost(center?: CostCenter) {
    setCostForm(
      center
        ? { id: center.id, site_id: center.site_id ?? "", name: center.name, code: center.code, active: center.active }
        : { ...EMPTY_COST, site_id: sites[0]?.id ?? "" },
    );
    setCostError(null);
    setCostModal(true);
  }

  async function saveCost() {
    if (!costForm.name.trim() || !costForm.code.trim()) {
      setCostError("El nombre y el código del centro de costo son obligatorios.");
      return;
    }
    setSaving("centro");
    setCostError(null);
    const payload = {
      name: costForm.name.trim(),
      code: costForm.code.trim().toUpperCase(),
      site_id: costForm.site_id || null,
      active: costForm.active,
    };
    const { error: saveError } = costForm.id
      ? await supabase.from("cost_centers").update(payload).eq("id", costForm.id)
      : await supabase.from("cost_centers").insert(payload);
    setSaving(null);
    if (saveError) {
      setCostError(saveError.message);
      return;
    }
    toast({ title: costForm.id ? "Centro actualizado" : "Centro creado", description: payload.name, variant: "success" });
    setCostModal(false);
    await load();
  }

  async function toggleCost(center: CostCenter) {
    await supabase.from("cost_centers").update({ active: !center.active }).eq("id", center.id);
    await load();
  }

  function openWindow(window?: ServiceWindow) {
    setWindowForm(
      window
        ? {
            id: window.id,
            site_id: window.site_id,
            meal_type: window.meal_type,
            name: window.name,
            start_time: window.start_time.slice(0, 5),
            end_time: window.end_time.slice(0, 5),
            days_allowed: window.days_allowed ?? [1, 2, 3, 4, 5],
            active: window.active,
          }
        : { ...EMPTY_WINDOW, site_id: sites[0]?.id ?? "" },
    );
    setWindowError(null);
    setWindowModal(true);
  }

  async function saveWindow() {
    if (!windowForm.site_id || !windowForm.name.trim()) {
      setWindowError("Selecciona la sede y asigna un nombre al horario.");
      return;
    }
    if (windowForm.start_time >= windowForm.end_time) {
      setWindowError("La hora de inicio debe ser menor que la hora de fin.");
      return;
    }
    setSaving("horario");
    setWindowError(null);
    const payload = {
      site_id: windowForm.site_id,
      meal_type: windowForm.meal_type,
      name: windowForm.name.trim(),
      start_time: windowForm.start_time,
      end_time: windowForm.end_time,
      days_allowed: windowForm.days_allowed,
      active: windowForm.active,
    };
    const { error: saveError } = windowForm.id
      ? await supabase.from("service_windows").update(payload).eq("id", windowForm.id)
      : await supabase.from("service_windows").insert(payload);
    setSaving(null);
    if (saveError) {
      setWindowError(saveError.message);
      return;
    }
    toast({ title: windowForm.id ? "Horario actualizado" : "Horario creado", description: payload.name, variant: "success" });
    setWindowModal(false);
    await load();
  }

  async function toggleWindow(window: ServiceWindow) {
    await supabase.from("service_windows").update({ active: !window.active }).eq("id", window.id);
    await load();
  }

  function openMenu(menu?: MenuRow) {
    setMenuForm(
      menu
        ? {
            id: menu.id,
            site_id: menu.site_id,
            menu_date: menu.menu_date,
            meal_type: menu.meal_type,
            title: menu.title,
            description: menu.description ?? "",
            calories: menu.calories ? String(menu.calories) : "",
            active: menu.active,
          }
        : { ...EMPTY_MENU, site_id: sites[0]?.id ?? "" },
    );
    setMenuError(null);
    setMenuModal(true);
  }

  async function saveMenu() {
    if (!menuForm.site_id || !menuForm.title.trim()) {
      setMenuError("Selecciona la sede y escribe el título del menú.");
      return;
    }
    setSaving("menu");
    setMenuError(null);
    const payload = {
      site_id: menuForm.site_id,
      menu_date: menuForm.menu_date,
      meal_type: menuForm.meal_type,
      title: menuForm.title.trim(),
      description: menuForm.description.trim() || null,
      calories: menuForm.calories ? Number(menuForm.calories) : null,
      active: menuForm.active,
    };
    const { error: saveError } = menuForm.id
      ? await supabase.from("menus").update(payload).eq("id", menuForm.id)
      : await supabase.from("menus").insert({ ...payload, created_by: profile?.id });
    setSaving(null);
    if (saveError) {
      setMenuError(saveError.message);
      return;
    }
    toast({ title: menuForm.id ? "Menú actualizado" : "Menú publicado", description: payload.title, variant: "success" });
    setMenuModal(false);
    await load();
  }

  function toggleDay(day: number) {
    setWindowForm((current) => ({
      ...current,
      days_allowed: current.days_allowed.includes(day)
        ? current.days_allowed.filter((item) => item !== day)
        : [...current.days_allowed, day].sort(),
    }));
  }

  const activeSites = useMemo(() => sites.filter((site) => site.active), [sites]);
  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);

  if (loading && !settings) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div>
        <PageHeader title="Configuración" description="Ajustes de la empresa y la operación del comedor." />
        <Alert variant="danger" title="No pudimos cargar la configuración">{error ?? "La fila única de company_settings no está disponible."}</Alert>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Sistema"
        title="Configuración"
        description="Datos de la empresa, sedes, horarios de servicio, centros de costo, menús y políticas de seguridad."
        actions={<Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => void load()}>Recargar</Button>}
      />

      {error ? <Alert variant="danger" className="mb-4" title="Algunos datos no cargaron">{error}</Alert> : null}

      <Tabs
        tabs={[
          { value: "empresa", label: "Empresa" },
          { value: "sedes", label: "Sedes", count: sites.length },
          { value: "horarios", label: "Horarios", count: windows.length },
          { value: "centros", label: "Centros de costo", count: centers.length },
          { value: "menus", label: "Menús", count: menus.length },
          { value: "seguridad", label: "Seguridad" },
          { value: "reportes", label: "Reportes" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "empresa" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Datos de la empresa</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted">Esta plataforma es de un solo tenant: una empresa y una o más sedes.</p>
              </div>
              <Building2 className="size-4 text-brand-600" />
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Razón social *">
                  <Input value={settings.company_name} onChange={(event) => updateSetting("company_name", event.target.value)} />
                </Field>
              </div>
              <Field label="NIT">
                <Input value={settings.nit ?? ""} onChange={(event) => updateSetting("nit", event.target.value)} placeholder="901.234.567-8" />
              </Field>
              <Field label="Correo de soporte">
                <Input type="email" value={settings.support_email ?? ""} onChange={(event) => updateSetting("support_email", event.target.value)} placeholder="soporte@empresa.com" />
              </Field>
              <Field label="URL del aviso de privacidad">
                <Input value={settings.privacy_url ?? ""} onChange={(event) => updateSetting("privacy_url", event.target.value)} placeholder="https://empresa.com/privacidad" />
              </Field>
              <Field label="URL del logo">
                <Input value={settings.logo_url ?? ""} onChange={(event) => updateSetting("logo_url", event.target.value)} placeholder="https://…/logo.png" />
              </Field>
              <Field label="Zona horaria">
                <Select value={settings.timezone} onChange={(event) => updateSetting("timezone", event.target.value)}>
                  <option value="America/Bogota">America/Bogota (Colombia)</option>
                  <option value="America/Mexico_City">America/Mexico_City</option>
                  <option value="America/Lima">America/Lima</option>
                  <option value="America/Santiago">America/Santiago</option>
                </Select>
              </Field>
              <Field label="Moneda">
                <Select value={settings.currency} onChange={(event) => updateSetting("currency", event.target.value)}>
                  <option value="COP">COP · Peso colombiano</option>
                  <option value="USD">USD · Dólar</option>
                  <option value="MXN">MXN · Peso mexicano</option>
                  <option value="PEN">PEN · Sol</option>
                </Select>
              </Field>
              <Field label="Color primario" hint="Se usa en la identidad visual del piloto.">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.primary_color}
                    onChange={(event) => updateSetting("primary_color", event.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-line-strong bg-white p-1"
                  />
                  <Input value={settings.primary_color} onChange={(event) => updateSetting("primary_color", event.target.value)} className="font-mono" />
                </div>
              </Field>
            </CardContent>
            <div className="flex justify-end border-t border-line px-5 py-3">
              <Button onClick={() => void saveCompany()} loading={saving === "empresa"} icon={<Save className="size-4" />}>Guardar empresa</Button>
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Resumen del piloto</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-[11px]">
                <div className="flex items-center justify-between rounded-xl bg-paper/50 px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-muted"><Store className="size-3.5" /> Sedes activas</span>
                  <strong className="text-ink">{activeSites.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-paper/50 px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-muted"><CreditCard className="size-3.5" /> Centros de costo</span>
                  <strong className="text-ink">{centers.filter((center) => center.active).length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-paper/50 px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-muted"><Clock3 className="size-3.5" /> Horarios activos</span>
                  <strong className="text-ink">{windows.filter((window) => window.active).length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-paper/50 px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-muted"><UtensilsCrossed className="size-3.5" /> Menús cargados</span>
                  <strong className="text-ink">{menus.length}</strong>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-brand-950 text-white">
              <CardContent className="p-5">
                <ShieldCheck className="size-5 text-citrus-300" />
                <p className="mt-3 text-sm font-bold">Un solo tenant, RLS por rol y sede</p>
                <p className="mt-1.5 text-[10px] leading-relaxed text-brand-100/70">
                  No hay registro público de empresas. Los usuarios se crean desde el panel de Supabase y se les asigna un rol
                  y una sede en profiles. La service role solo se usa dentro de Edge Functions.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "sedes" ? (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Sedes y cafeterías</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">Cada sede tiene su propio horario, operadores y conciliación.</p>
            </div>
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => openSite()}>Nueva sede</Button>
          </CardHeader>
          <CardContent className="p-0">
            {sites.length === 0 ? (
              <EmptyState icon={<Store className="size-5" />} title="Aún no hay sedes" action={<Button size="sm" onClick={() => openSite()}>Crear la primera</Button>} />
            ) : (
              <div className="divide-y divide-line/70">
                {sites.map((site) => (
                  <div key={site.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${site.active ? "bg-brand-50 text-brand-700" : "bg-paper-deep text-muted"}`}>
                      <MapPin className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-ink">{site.name}</p>
                        <Badge variant="outline">{site.code}</Badge>
                        <Badge variant={site.active ? "success" : "muted"}>{site.active ? "Activa" : "Inactiva"}</Badge>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {[site.address, site.city, site.phone, site.manager_name].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => openSite(site)}>Editar</Button>
                      <Button variant="ghost" size="sm" icon={<Power className="size-3.5" />} onClick={() => void toggleSite(site)}>{site.active ? "Desactivar" : "Activar"}</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "horarios" ? (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Horarios de servicio</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">Definen cuándo se puede generar el QR y validar cada comida.</p>
            </div>
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => openWindow()}>Nuevo horario</Button>
          </CardHeader>
          <CardContent className="p-0">
            {windows.length === 0 ? (
              <EmptyState icon={<Clock3 className="size-5" />} title="Sin horarios configurados" action={<Button size="sm" onClick={() => openWindow()}>Crear horario</Button>} />
            ) : (
              <div className="divide-y divide-line/70">
                {windows.map((window) => (
                  <div key={window.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${window.active ? "bg-brand-50 text-brand-700" : "bg-paper-deep text-muted"}`}>
                      <Clock3 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-ink">{window.name}</p>
                        <Badge variant={window.meal_type === "almuerzo" ? "default" : "warning"}>{MEAL_LABELS[window.meal_type]}</Badge>
                        <Badge variant={window.active ? "success" : "muted"}>{window.active ? "Activo" : "Inactivo"}</Badge>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {siteMap.get(window.site_id)?.name ?? "Sede"} · {window.start_time.slice(0, 5)} – {window.end_time.slice(0, 5)} ·{" "}
                        {(window.days_allowed ?? []).map((day) => DAY_LABELS[day]).join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => openWindow(window)}>Editar</Button>
                      <Button variant="ghost" size="sm" icon={<Power className="size-3.5" />} onClick={() => void toggleWindow(window)}>{window.active ? "Desactivar" : "Activar"}</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "centros" ? (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Centros de costo</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">Permiten distribuir el costo de alimentación por área o proyecto.</p>
            </div>
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => openCost()}>Nuevo centro</Button>
          </CardHeader>
          <CardContent className="p-0">
            {centers.length === 0 ? (
              <EmptyState icon={<CreditCard className="size-5" />} title="Sin centros de costo" action={<Button size="sm" onClick={() => openCost()}>Crear centro</Button>} />
            ) : (
              <div className="divide-y divide-line/70">
                {centers.map((center) => (
                  <div key={center.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${center.active ? "bg-brand-50 text-brand-700" : "bg-paper-deep text-muted"}`}>
                      <CreditCard className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-ink">{center.name}</p>
                      <p className="text-[10px] text-muted">{center.code} · {center.site_id ? siteMap.get(center.site_id)?.name ?? "Sede" : "Todas las sedes"}</p>
                    </div>
                    <Badge variant={center.active ? "success" : "muted"}>{center.active ? "Activo" : "Inactivo"}</Badge>
                    <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => openCost(center)}>Editar</Button>
                    <Button variant="ghost" size="sm" icon={<Power className="size-3.5" />} onClick={() => void toggleCost(center)}>{center.active ? "Desactivar" : "Activar"}</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "menus" ? (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Menús publicados</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted">El menú del día se muestra en el panel general para cada sede.</p>
            </div>
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => openMenu()}>Publicar menú</Button>
          </CardHeader>
          <CardContent className="p-0">
            {menus.length === 0 ? (
              <EmptyState icon={<ChefHat className="size-5" />} title="Aún no hay menús" action={<Button size="sm" onClick={() => openMenu()}>Publicar el primero</Button>} />
            ) : (
              <div className="divide-y divide-line/70">
                {menus.map((menu) => (
                  <div key={menu.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><ChefHat className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-ink">{menu.title}</p>
                        <Badge variant={menu.meal_type === "almuerzo" ? "default" : "warning"}>{MEAL_LABELS[menu.meal_type]}</Badge>
                        <Badge variant={menu.active ? "success" : "muted"}>{menu.active ? "Activo" : "Inactivo"}</Badge>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted">{menu.sites?.name} · {formatDate(menu.menu_date)}{menu.calories ? ` · ${menu.calories} kcal` : ""}</p>
                      {menu.description ? <p className="mt-0.5 line-clamp-1 text-[10px] text-muted">{menu.description}</p> : null}
                    </div>
                    <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => openMenu(menu)}>Editar</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "seguridad" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Políticas de validación</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted">Ventanas de vigencia, modo offline y límites de excepción.</p>
              </div>
              <ShieldCheck className="size-4 text-brand-600" />
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Vigencia del tiquete (minutos)" hint="Tiempo máximo entre emisión y consumo.">
                <Input type="number" min={15} max={1440} value={settings.ticket_validity_minutes} onChange={(event) => updateSetting("ticket_validity_minutes", Number(event.target.value))} />
              </Field>
              <Field label="Vida del QR (segundos)" hint="Entre 30 y 60 segundos. Se aplica a cada token.">
                <Input type="number" min={30} max={60} value={settings.qr_ttl_seconds} onChange={(event) => updateSetting("qr_ttl_seconds", Number(event.target.value))} />
              </Field>
              <Field label="Ventana de gracia offline (minutos)" hint="Máximo tiempo para sincronizar un consumo offline.">
                <Input type="number" min={1} max={60} value={settings.offline_grace_minutes} onChange={(event) => updateSetting("offline_grace_minutes", Number(event.target.value))} />
              </Field>
              <Field label="Máximo de excepciones por día" hint="Por sede. Un administrador puede autorizar por encima del límite.">
                <Input type="number" min={0} max={20} value={settings.max_overrides_per_day} onChange={(event) => updateSetting("max_overrides_per_day", Number(event.target.value))} />
              </Field>
              <div className="rounded-xl border border-line bg-white px-3.5 py-3">
                <Toggle checked={settings.allow_offline} onChange={(value) => updateSetting("allow_offline", value)} label="Permitir modo offline" description="Los consumos se cifran en el dispositivo y se sincronizan después." />
              </div>
              <div className="rounded-xl border border-line bg-white px-3.5 py-3">
                <Toggle checked={settings.require_device} onChange={(value) => updateSetting("require_device", value)} label="Exigir dispositivo registrado" description="Solo cajas autorizadas pueden validar consumos." />
              </div>
              <div className="rounded-xl border border-line bg-white px-3.5 py-3 sm:col-span-2">
                <Toggle
                  checked={settings.require_mfa}
                  onChange={(value) => updateSetting("require_mfa", value)}
                  label="Exigir segundo factor (MFA)"
                  description="Administradores, RR.HH., supervisores y auditores deben verificar un código TOTP al iniciar sesión."
                />
              </div>
            </CardContent>
            <div className="flex justify-end border-t border-line px-5 py-3">
              <Button onClick={() => void saveSecurity()} loading={saving === "seguridad"} icon={<Save className="size-4" />}>Guardar seguridad</Button>
            </div>
          </Card>

          <Card className="bg-citrus-100/40">
            <CardContent className="p-5">
              <ShieldCheck className="size-5 text-[#8a6110]" />
              <p className="mt-3 text-sm font-bold text-[#6d4e0d]">Recomendaciones del piloto</p>
              <ul className="mt-2 space-y-2 text-[10px] leading-relaxed text-[#7a5a12]">
                <li>• Mantén el QR en 45 segundos: reduce el riesgo de captura de pantalla.</li>
                <li>• Activa el modo offline solo si la sede tiene cortes de red frecuentes.</li>
                <li>• Limita las excepciones y revísalas a diario en Seguridad.</li>
                <li>• Exige MFA a administradores y supervisores antes de producción.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "reportes" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Reporte programado</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted">Envío automático del resumen diario a los responsables.</p>
              </div>
              <Mail className="size-4 text-brand-600" />
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="rounded-xl border border-line bg-white px-3.5 py-3">
                  <Toggle
                    checked={settings.report_enabled}
                    onChange={(value) => updateSetting("report_enabled", value)}
                    label="Activar reporte automático"
                    description="El resumen se genera al cierre de la jornada y se envía por correo."
                  />
                </div>
              </div>
              <Field label="Frecuencia">
                <Select value={settings.report_schedule} onChange={(event) => updateSetting("report_schedule", event.target.value)}>
                  <option value="diario">Diario</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensual">Mensual</option>
                </Select>
              </Field>
              <Field label="Hora de envío">
                <Input type="time" value={settings.report_hour?.slice(0, 5) ?? "18:00"} onChange={(event) => updateSetting("report_hour", event.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Destinatarios" hint="Separa los correos con coma.">
                  <Input
                    value={(settings.report_recipients ?? []).join(", ")}
                    onChange={(event) => updateSetting("report_recipients", event.target.value.split(",").map((email) => email.trim()).filter(Boolean))}
                    placeholder="gerencia@empresa.com, rrhh@empresa.com"
                  />
                </Field>
              </div>
            </CardContent>
            <div className="flex justify-end border-t border-line px-5 py-3">
              <Button onClick={() => void saveReports()} loading={saving === "reportes"} icon={<Save className="size-4" />}>Guardar reportes</Button>
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Estado</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-[11px]">
              <div className="flex items-center justify-between rounded-xl bg-paper/50 px-3 py-2.5">
                <span className="text-muted">Reporte automático</span>
                <Badge variant={settings.report_enabled ? "success" : "muted"}>{settings.report_enabled ? "Activo" : "Inactivo"}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-paper/50 px-3 py-2.5">
                <span className="text-muted">Frecuencia</span>
                <strong className="text-ink">{settings.report_schedule}</strong>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-paper/50 px-3 py-2.5">
                <span className="text-muted">Hora</span>
                <strong className="text-ink">{settings.report_hour?.slice(0, 5)}</strong>
              </div>
              <div className="rounded-xl bg-paper/50 px-3 py-2.5">
                <p className="text-muted">Destinatarios</p>
                <p className="mt-1 break-words font-semibold text-ink">{(settings.report_recipients ?? []).join(", ") || "Ninguno"}</p>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                La programación se persiste en company_settings. La entrega automática se ejecuta con pg_cron y un proveedor de correo
                configurado en los secretos del proyecto.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Modal
        open={siteModal}
        onClose={() => setSiteModal(false)}
        title={siteForm.id ? "Editar sede" : "Nueva sede"}
        description="Las sedes agrupan empleados, horarios, operadores y conciliación de cocina."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSiteModal(false)}>Cancelar</Button>
            <Button onClick={() => void saveSite()} loading={saving === "sede"}>{siteForm.id ? "Guardar sede" : "Crear sede"}</Button>
          </>
        }
      >
        {siteError ? <Alert variant="danger" className="mb-4">{siteError}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre *"><Input value={siteForm.name} onChange={(event) => setSiteForm({ ...siteForm, name: event.target.value })} placeholder="Sede Central" /></Field>
          <Field label="Código *"><Input value={siteForm.code} onChange={(event) => setSiteForm({ ...siteForm, code: event.target.value.toUpperCase() })} placeholder="CENTRAL" /></Field>
          <Field label="Dirección"><Input value={siteForm.address} onChange={(event) => setSiteForm({ ...siteForm, address: event.target.value })} placeholder="Calle 100 # 10-20" /></Field>
          <Field label="Ciudad"><Input value={siteForm.city} onChange={(event) => setSiteForm({ ...siteForm, city: event.target.value })} placeholder="Bogotá" /></Field>
          <Field label="Teléfono"><Input value={siteForm.phone} onChange={(event) => setSiteForm({ ...siteForm, phone: event.target.value })} placeholder="+57 601 000 0000" /></Field>
          <Field label="Responsable"><Input value={siteForm.manager_name} onChange={(event) => setSiteForm({ ...siteForm, manager_name: event.target.value })} placeholder="Nombre del gerente de sede" /></Field>
          <div className="sm:col-span-2 rounded-xl border border-line bg-white px-3.5 py-3">
            <Toggle checked={siteForm.active} onChange={(value) => setSiteForm({ ...siteForm, active: value })} label="Sede activa" description="Disponible para empleados y operación." />
          </div>
        </div>
      </Modal>

      <Modal
        open={costModal}
        onClose={() => setCostModal(false)}
        title={costForm.id ? "Editar centro de costo" : "Nuevo centro de costo"}
        description="Agrupa empleados para distribuir el costo de alimentación."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCostModal(false)}>Cancelar</Button>
            <Button onClick={() => void saveCost()} loading={saving === "centro"}>{costForm.id ? "Guardar centro" : "Crear centro"}</Button>
          </>
        }
      >
        {costError ? <Alert variant="danger" className="mb-4">{costError}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre *"><Input value={costForm.name} onChange={(event) => setCostForm({ ...costForm, name: event.target.value })} placeholder="Administración" /></Field>
          <Field label="Código *"><Input value={costForm.code} onChange={(event) => setCostForm({ ...costForm, code: event.target.value.toUpperCase() })} placeholder="CC-ADM" /></Field>
          <div className="sm:col-span-2">
            <Field label="Sede">
              <Select value={costForm.site_id} onChange={(event) => setCostForm({ ...costForm, site_id: event.target.value })}>
                <option value="">Todas las sedes</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2 rounded-xl border border-line bg-white px-3.5 py-3">
            <Toggle checked={costForm.active} onChange={(value) => setCostForm({ ...costForm, active: value })} label="Centro activo" />
          </div>
        </div>
      </Modal>

      <Modal
        open={windowModal}
        onClose={() => setWindowModal(false)}
        title={windowForm.id ? "Editar horario" : "Nuevo horario de servicio"}
        description="El QR solo se genera dentro de la ventana activa y en los días permitidos."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setWindowModal(false)}>Cancelar</Button>
            <Button onClick={() => void saveWindow()} loading={saving === "horario"}>{windowForm.id ? "Guardar horario" : "Crear horario"}</Button>
          </>
        }
      >
        {windowError ? <Alert variant="danger" className="mb-4">{windowError}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sede *">
            <Select value={windowForm.site_id} onChange={(event) => setWindowForm({ ...windowForm, site_id: event.target.value })}>
              <option value="">Selecciona</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </Select>
          </Field>
          <Field label="Comida *">
            <Select value={windowForm.meal_type} onChange={(event) => setWindowForm({ ...windowForm, meal_type: event.target.value as MealType })}>
              <option value="almuerzo">Almuerzo</option>
              <option value="merienda">Merienda</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Nombre del horario *"><Input value={windowForm.name} onChange={(event) => setWindowForm({ ...windowForm, name: event.target.value })} placeholder="Almuerzo jornada diurna" /></Field>
          </div>
          <Field label="Hora de inicio *"><Input type="time" value={windowForm.start_time} onChange={(event) => setWindowForm({ ...windowForm, start_time: event.target.value })} /></Field>
          <Field label="Hora de fin *"><Input type="time" value={windowForm.end_time} onChange={(event) => setWindowForm({ ...windowForm, end_time: event.target.value })} /></Field>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-ink">Días permitidos</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const selected = windowForm.days_allowed.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition ${selected ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-white text-muted hover:border-brand-200"}`}
                >
                  {selected ? <Check className="size-3" /> : null}
                  {DAY_LABELS[day]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-line bg-white px-3.5 py-3">
          <Toggle checked={windowForm.active} onChange={(value) => setWindowForm({ ...windowForm, active: value })} label="Horario activo" description="Solo los horarios activos permiten generar QR." />
        </div>
      </Modal>

      <Modal
        open={menuModal}
        onClose={() => setMenuModal(false)}
        title={menuForm.id ? "Editar menú" : "Publicar menú"}
        description="El menú del día se muestra en el panel general de la sede."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMenuModal(false)}>Cancelar</Button>
            <Button onClick={() => void saveMenu()} loading={saving === "menu"}>{menuForm.id ? "Guardar menú" : "Publicar menú"}</Button>
          </>
        }
      >
        {menuError ? <Alert variant="danger" className="mb-4">{menuError}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sede *">
            <Select value={menuForm.site_id} onChange={(event) => setMenuForm({ ...menuForm, site_id: event.target.value })}>
              <option value="">Selecciona</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </Select>
          </Field>
          <Field label="Fecha *"><Input type="date" value={menuForm.menu_date} onChange={(event) => setMenuForm({ ...menuForm, menu_date: event.target.value })} /></Field>
          <Field label="Comida *">
            <Select value={menuForm.meal_type} onChange={(event) => setMenuForm({ ...menuForm, meal_type: event.target.value as MealType })}>
              <option value="almuerzo">Almuerzo</option>
              <option value="merienda">Merienda</option>
            </Select>
          </Field>
          <Field label="Calorías"><Input type="number" min={0} value={menuForm.calories} onChange={(event) => setMenuForm({ ...menuForm, calories: event.target.value })} placeholder="650" /></Field>
          <div className="sm:col-span-2">
            <Field label="Título *"><Input value={menuForm.title} onChange={(event) => setMenuForm({ ...menuForm, title: event.target.value })} placeholder="Almuerzo ejecutivo" /></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Descripción"><Textarea value={menuForm.description} onChange={(event) => setMenuForm({ ...menuForm, description: event.target.value })} placeholder="Sopa, proteína, arroz, ensalada y jugo." /></Field>
          </div>
          <div className="sm:col-span-2 rounded-xl border border-line bg-white px-3.5 py-3">
            <Toggle checked={menuForm.active} onChange={(value) => setMenuForm({ ...menuForm, active: value })} label="Menú activo" />
          </div>
        </div>
      </Modal>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-[10px] leading-relaxed text-muted">
        <Settings className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <span>Los cambios de configuración se registran en la auditoría inmutable. La plataforma no permite registro público de empresas ni facturación SaaS: es un despliegue de un solo tenant.</span>
      </div>
    </div>
  );
}
