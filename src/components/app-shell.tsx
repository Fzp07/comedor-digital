"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  ScanLine,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
  UtensilsCrossed,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";
import type { AppRole, Profile } from "@/lib/types";
import { cn, ROLE_LABELS, formatDateLong, relativeTime } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Avatar, Button, Spinner } from "@/components/ui";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: AppRole[];
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const ALL_ROLES: AppRole[] = ["admin", "rrhh", "operador", "supervisor", "auditor", "empleado"];

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { href: "/app/dashboard", label: "Panel general", icon: LayoutDashboard, roles: ["admin", "rrhh", "supervisor", "auditor"] },
      { href: "/app/operador", label: "Validar comedor", icon: ScanLine, roles: ["admin", "operador", "supervisor"], badge: "Live" },
      { href: "/app/mi-qr", label: "Mi QR", icon: QrCode, roles: ["empleado"] },
      { href: "/app/tiquetes", label: "Tiquetes", icon: Ticket, roles: ["admin", "rrhh", "supervisor"] },
      { href: "/app/historial", label: "Historial", icon: History, roles: ALL_ROLES },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/app/empleados", label: "Empleados", icon: Users, roles: ["admin", "rrhh", "auditor"] },
      { href: "/app/planes", label: "Planes y cupos", icon: UtensilsCrossed, roles: ["admin", "rrhh"] },
      { href: "/app/reportes", label: "Consultas y reportes", icon: BarChart3, roles: ["admin", "rrhh", "supervisor", "auditor"] },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/app/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
      { href: "/app/seguridad", label: "Seguridad y auditoría", icon: ShieldCheck, roles: ["admin", "auditor"] },
    ],
  },
];

const PAGE_META: Record<string, { title: string; eyebrow: string }> = {
  "/app/dashboard": { title: "Panel general", eyebrow: "Operación" },
  "/app/operador": { title: "Validar comedor", eyebrow: "Operación" },
  "/app/mi-qr": { title: "Mi QR", eyebrow: "Empleado" },
  "/app/tiquetes": { title: "Tiquetes", eyebrow: "Operación" },
  "/app/historial": { title: "Historial de consumo", eyebrow: "Trazabilidad" },
  "/app/empleados": { title: "Empleados", eyebrow: "Gestión" },
  "/app/planes": { title: "Planes y cupos", eyebrow: "Gestión" },
  "/app/reportes": { title: "Consultas y reportes", eyebrow: "Analítica" },
  "/app/configuracion": { title: "Configuración", eyebrow: "Sistema" },
  "/app/seguridad": { title: "Seguridad y auditoría", eyebrow: "Sistema" },
};

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string;
  read_at: string | null;
  created_at: string;
}

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarContentProps {
  groups: NavGroup[];
  profile: Profile | null;
  role: AppRole | undefined;
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
}

function SidebarContent({ groups, profile, role, pathname, onNavigate, onSignOut }: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-6 pt-6">
        <Link href="/app" onClick={onNavigate}>
          <Logo dark />
        </Link>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-brand-200">
          Piloto
        </span>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[9px] font-extrabold uppercase tracking-[0.2em] text-brand-200/50">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isPathActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition",
                      active
                        ? "bg-white/[0.11] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                        : "text-brand-100/65 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <item.icon className={cn("size-4 shrink-0", active ? "text-citrus-300" : "text-brand-200/60 group-hover:text-brand-200")} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-citrus-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-citrus-300">
                        {item.badge}
                      </span>
                    ) : null}
                    {active ? <span className="size-1.5 rounded-full bg-citrus-300" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="rounded-2xl bg-white/[0.055] p-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={profile?.full_name} size="sm" className="ring-white/20" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">{profile?.full_name ?? "Usuario"}</p>
              <p className="truncate text-[10px] text-brand-200/60">{role ? ROLE_LABELS[role] : ""}</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg p-1.5 text-brand-200/60 transition hover:bg-white/10 hover:text-white"
              title="Cerrar sesión"
            >
              <LogOut className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[9px] text-brand-200/50">
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-brand-400" />
              Supabase
            </span>
            <span>·</span>
            <span>RLS activo</span>
            <span>·</span>
            <span>v1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const role = profile?.role;

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => (role ? item.roles.includes(role) : false)),
      })).filter((group) => group.items.length > 0),
    [role],
  );

  const bottomItems = useMemo(() => {
    if (role === "empleado") {
      return [
        { href: "/app/mi-qr", label: "Mi QR", icon: QrCode },
        { href: "/app/historial", label: "Historial", icon: History },
      ];
    }
    if (role === "operador") {
      return [
        { href: "/app/operador", label: "Validar", icon: ScanLine },
        { href: "/app/historial", label: "Historial", icon: History },
      ];
    }
    return [
      { href: "/app/dashboard", label: "Panel", icon: LayoutDashboard },
      { href: "/app/operador", label: "Validar", icon: ScanLine },
      { href: "/app/tiquetes", label: "Tiquetes", icon: Ticket },
      { href: "/app/historial", label: "Historial", icon: History },
    ].filter((item) => {
      if (item.href === "/app/operador") return role ? ["admin", "supervisor", "operador"].includes(role) : false;
      return true;
    });
  }, [role]);

  const pageMeta = PAGE_META[pathname] ?? { title: "Comedor Digital", eyebrow: "Panel" };

  const unread = notifications.filter((item) => !item.read_at).length;

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
    setNotificationsOpen(false);
  }, [pathname]);

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
    function handleClick(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) setNotificationsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadNotifications() {
    if (!profile) return;
    setNotificationsLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("id,title,body,type,read_at,created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(8);
    setNotifications((data ?? []) as NotificationItem[]);
    setNotificationsLoading(false);
  }

  useEffect(() => {
    if (!profile) return;
    void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function openNotifications() {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    setProfileOpen(false);
    if (next) await loadNotifications();
  }

  async function markAllRead() {
    if (!profile || unread === 0) return;
    const now = new Date().toISOString();
    await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", profile.id)
      .is("read_at", null);
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <aside className="sidebar-texture fixed inset-y-0 left-0 z-40 hidden w-[268px] lg:block">
        <SidebarContent groups={groups} profile={profile} role={role} pathname={pathname} onSignOut={handleSignOut} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-brand-950/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />
          <aside className="sidebar-texture relative h-full w-[286px] max-w-[85vw] shadow-float animate-rise">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-full p-2 text-brand-100/70 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar menú"
            >
              <X className="size-5" />
            </button>
            <SidebarContent
              groups={groups}
              profile={profile}
              role={role}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
              onSignOut={handleSignOut}
            />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[268px]">
        <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/85 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-line bg-card p-2 text-ink lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="size-5" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="hidden text-[9px] font-extrabold uppercase tracking-[0.18em] text-brand-600 sm:block">{pageMeta.eyebrow}</p>
              <h1 className="truncate text-sm font-extrabold text-ink sm:text-base">{pageMeta.title}</h1>
            </div>

            <div className="hidden items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-[10px] font-semibold text-muted md:flex">
              <span className={cn("size-1.5 rounded-full", online ? "bg-brand-500" : "bg-clay-400")} />
              {online ? "En línea" : "Modo offline"}
              <span className="text-line-strong">|</span>
              {formatDateLong(new Date())}
            </div>

            {!online ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-citrus-100 px-2 py-1 text-[9px] font-bold text-[#7a5a12] md:hidden">
                <WifiOff className="size-3" /> Offline
              </span>
            ) : null}

            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={openNotifications}
                className="relative rounded-xl border border-line bg-card p-2 text-muted transition hover:text-ink"
                aria-label="Notificaciones"
              >
                <Bell className="size-4.5" />
                {unread > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-clay-500 text-[8px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <div className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-card shadow-float animate-rise">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <div>
                      <p className="text-xs font-bold text-ink">Notificaciones</p>
                      <p className="text-[10px] text-muted">{unread} sin leer</p>
                    </div>
                    <button type="button" onClick={markAllRead} className="text-[10px] font-bold text-brand-700 hover:underline">
                      Marcar leídas
                    </button>
                  </div>
                  <div className="scrollbar-thin max-h-[22rem] overflow-y-auto">
                    {notificationsLoading ? (
                      <div className="flex justify-center py-8"><Spinner /></div>
                    ) : notifications.length === 0 ? (
                      <p className="px-4 py-8 text-center text-xs text-muted">No hay notificaciones por ahora.</p>
                    ) : (
                      notifications.map((item) => (
                        <div key={item.id} className={cn("border-b border-line/60 px-4 py-3 last:border-0", !item.read_at && "bg-brand-50/50")}>
                          <div className="flex items-start gap-2">
                            <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", item.type === "critical" ? "bg-clay-500" : item.type === "warning" ? "bg-citrus-500" : "bg-brand-500")} />
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-ink">{item.title}</p>
                              {item.body ? <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{item.body}</p> : null}
                              <p className="mt-1 text-[9px] text-muted/70">{relativeTime(item.created_at)}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((value) => !value);
                  setNotificationsOpen(false);
                }}
                className="flex items-center gap-2 rounded-xl border border-line bg-card p-1.5 pr-2.5 transition hover:border-brand-300"
              >
                <Avatar name={profile?.full_name} size="sm" />
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[8rem] truncate text-[11px] font-bold text-ink">{profile?.full_name ?? "Usuario"}</span>
                  <span className="block text-[9px] text-muted">{role ? ROLE_LABELS[role] : ""}</span>
                </span>
                <ChevronDown className="size-3.5 text-muted" />
              </button>

              {profileOpen ? (
                <div className="absolute right-0 top-12 w-64 overflow-hidden rounded-2xl border border-line bg-card shadow-float animate-rise">
                  <div className="border-b border-line px-4 py-3">
                    <p className="text-xs font-bold text-ink">{profile?.full_name}</p>
                    <p className="text-[10px] text-muted">{profile?.email}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[9px] font-bold text-brand-800">
                        {role ? ROLE_LABELS[role] : ""}
                      </span>
                      {profile?.mfa_enrolled ? (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9px] font-bold text-brand-700">MFA activo</span>
                      ) : (
                        <span className="rounded-full bg-citrus-100 px-2 py-0.5 text-[9px] font-bold text-[#7a5a12]">MFA pendiente</span>
                      )}
                    </div>
                  </div>
                  <div className="p-1.5">
                    <Link
                      href="/app/seguridad"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold text-muted hover:bg-paper-deep hover:text-ink"
                    >
                      <ShieldCheck className="size-3.5" /> Seguridad de la cuenta
                    </Link>
                    <Link
                      href="/privacidad"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold text-muted hover:bg-paper-deep hover:text-ink"
                    >
                      <ClipboardList className="size-3.5" /> Aviso de privacidad
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold text-clay-500 hover:bg-clay-100"
                    >
                      <LogOut className="size-3.5" /> Cerrar sesión
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {bottomItems.map((item) => {
            const active = isPathActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-w-[4rem] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[9px] font-bold transition",
                  active ? "text-brand-700" : "text-muted",
                )}
              >
                <span className={cn("flex size-8 items-center justify-center rounded-xl", active ? "bg-brand-100" : "")}>
                  <item.icon className="size-4.5" />
                </span>
                {item.label}
                {active ? <span className="absolute -top-1.5 h-0.5 w-6 rounded-full bg-brand-600" /> : null}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex min-w-[4rem] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[9px] font-bold text-muted"
          >
            <span className="flex size-8 items-center justify-center rounded-xl">
              {online ? <Menu className="size-4.5" /> : <WifiOff className="size-4.5" />}
            </span>
            Más
          </button>
        </div>
      </nav>
    </div>
  );
}

export function FullScreenLoader({ label = "Cargando tu comedor…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5">
      <Logo />
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Spinner className="size-4" /> {label}
      </div>
    </div>
  );
}

export function AccessDenied() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-clay-100 text-clay-500">
        <ShieldCheck className="size-6" />
      </div>
      <h1 className="mt-5 font-display text-3xl text-ink">Acceso restringido</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Tu rol no tiene permiso para ver esta sección. Si necesitas acceso, solicítalo al administrador
        de la plataforma.
      </p>
      <div className="mt-5">
        <Link href="/app"><Button variant="secondary">Volver al panel</Button></Link>
      </div>
    </div>
  );
}

export function RoleGate({ roles, children }: { roles: AppRole[]; children: React.ReactNode }) {
  const { profile } = useAuth();
  if (!profile) return <FullScreenLoader />;
  if (!roles.includes(profile.role)) return <AccessDenied />;
  return <>{children}</>;
}

export { Wifi, Bell };
