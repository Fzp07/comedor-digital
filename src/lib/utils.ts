import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AppRole, EmployeeStatus, MealType, RedemptionMethod, TicketStatus } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  rrhh: "Recursos Humanos",
  operador: "Operador de comedor",
  supervisor: "Supervisor",
  auditor: "Auditor",
  empleado: "Empleado",
};

export const ROLE_SHORT: Record<AppRole, string> = {
  admin: "Admin",
  rrhh: "RR.HH.",
  operador: "Operador",
  supervisor: "Supervisor",
  auditor: "Auditor",
  empleado: "Empleado",
};

export const MEAL_LABELS: Record<MealType, string> = {
  almuerzo: "Almuerzo",
  merienda: "Merienda",
};

export const METHOD_LABELS: Record<RedemptionMethod, string> = {
  qr: "QR dinámico",
  huella: "Huella / passkey",
  pin: "PIN",
  carnet: "Carné",
  manual: "Manual",
};

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  retirado: "Retirado",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  emitido: "Emitido",
  disponible: "Disponible",
  usado: "Usado",
  vencido: "Vencido",
  anulado: "Anulado",
};

export const DAY_LABELS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function roleHome(role: AppRole | undefined | null): string {
  switch (role) {
    case "operador":
      return "/app/operador";
    case "empleado":
      return "/app/mi-qr";
    default:
      return "/app/dashboard";
  }
}

export function initials(name?: string | null): string {
  if (!name?.trim()) return "CD";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const bogota = "America/Bogota";

export function formatDate(value?: string | Date | null, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: bogota,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}

export function formatDateLong(value?: string | Date | null): string {
  return formatDate(value, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatTime(value?: string | Date | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: bogota,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "—";
  return `${formatDate(value)} · ${formatTime(value)}`;
}

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: bogota,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDaysISO(days: number): string {
  const date = new Date(`${todayISO()}T12:00:00-05:00`);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: bogota,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function relativeTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return formatDate(date);
}

export function currencyCOP(value?: number | null): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

export function clockInBogota(): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: bogota,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: Array<{ key: string; label: string }>) {
  const keys = columns?.map((column) => column.key) ?? Object.keys(rows[0] ?? {});
  const header = columns?.map((column) => column.label) ?? keys;
  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(keys.map((key) => csvEscape(row[key])).join(","));
  }
  const blob = new Blob([`\ufeff${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function mealWindowStatus(
  windows: Array<{ meal_type: MealType; start_time: string; end_time: string; days_allowed: number[] }> | undefined,
  meal: MealType,
): { open: boolean; label: string } {
  if (!windows?.length) return { open: false, label: "Sin horario configurado" };
  const now = new Date();
  const bogotaNow = new Date(now.toLocaleString("en-US", { timeZone: bogota }));
  const day = bogotaNow.getDay() === 0 ? 7 : bogotaNow.getDay();
  const minutes = bogotaNow.getHours() * 60 + bogotaNow.getMinutes();
  const window = windows.find((item) => item.meal_type === meal && item.days_allowed.includes(day));
  if (!window) return { open: false, label: "Hoy no hay servicio" };
  const [sh, sm] = window.start_time.split(":").map(Number);
  const [eh, em] = window.end_time.split(":").map(Number);
  const open = minutes >= sh * 60 + sm && minutes <= eh * 60 + em;
  return { open, label: `${window.start_time.slice(0, 5)} – ${window.end_time.slice(0, 5)}` };
}
