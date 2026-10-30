"use client";

import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, Loader2, Search, X } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { EmployeeStatus, RedemptionStatus, TicketStatus } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
  {
    variants: {
      variant: {
        primary: "bg-brand-700 text-white shadow-[0_10px_24px_-14px_rgba(14,102,86,0.9)] hover:bg-brand-800 active:scale-[0.99]",
        secondary: "border border-line-strong bg-white text-ink hover:border-brand-300 hover:bg-brand-50",
        soft: "bg-brand-50 text-brand-800 hover:bg-brand-100",
        ghost: "text-muted hover:bg-paper-deep hover:text-ink",
        danger: "bg-clay-500 text-white hover:bg-[#b64f35]",
        dangerSoft: "bg-clay-100 text-clay-500 hover:bg-clay-200",
        dark: "bg-brand-950 text-white hover:bg-brand-900",
        outline: "border border-white/20 bg-white/5 text-white hover:bg-white/10",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-sm",
        xl: "h-14 px-6 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, icon, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("surface", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex items-start justify-between gap-4 border-b border-line/70 px-5 py-4", className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h3 className={cn("text-sm font-bold tracking-tight text-ink", className)}>{children}</h3>;
}

export function CardDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("mt-0.5 text-xs leading-relaxed text-muted", className)}>{children}</p>;
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

const badgeStyles = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none", {
  variants: {
    variant: {
      default: "bg-brand-50 text-brand-800",
      success: "bg-brand-100 text-brand-800",
      warning: "bg-citrus-100 text-[#8a6110]",
      danger: "bg-clay-100 text-clay-500",
      info: "bg-sky-100 text-[#235f70]",
      muted: "bg-paper-deep text-muted",
      outline: "border border-line-strong bg-white text-muted",
      dark: "bg-brand-950 text-white",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({
  variant,
  className,
  children,
}: VariantProps<typeof badgeStyles> & { className?: string; children: ReactNode }) {
  return <span className={cn(badgeStyles({ variant }), className)}>{children}</span>;
}

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  const map: Record<EmployeeStatus, { label: string; variant: "success" | "warning" | "muted" }> = {
    activo: { label: "Activo", variant: "success" },
    suspendido: { label: "Suspendido", variant: "warning" },
    retirado: { label: "Retirado", variant: "muted" },
  };
  const item = map[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const map: Record<TicketStatus, { label: string; variant: "success" | "warning" | "danger" | "muted" | "info" | "default" }> = {
    emitido: { label: "Emitido", variant: "info" },
    disponible: { label: "Disponible", variant: "success" },
    usado: { label: "Usado", variant: "default" },
    vencido: { label: "Vencido", variant: "warning" },
    anulado: { label: "Anulado", variant: "danger" },
  };
  const item = map[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function RedemptionStatusBadge({ status }: { status: RedemptionStatus }) {
  return (
    <Badge variant={status === "valido" ? "success" : "muted"}>
      {status === "valido" ? "Válido" : "Compensado"}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-xs font-semibold text-ink", className)} {...props}>
      {children}
    </label>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {error ? <p className="mt-1 text-[11px] font-medium text-clay-500">{error}</p> : hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

const fieldBase =
  "w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition placeholder:text-muted/60 hover:border-[#c8bfae] focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none disabled:cursor-not-allowed disabled:bg-paper-deep/50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(fieldBase, "appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2368766f%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[right_0.8rem_center] bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 resize-y", className)} {...props} />;
});

export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 text-left disabled:opacity-50"
    >
      {label ? (
        <span>
          <span className="block text-sm font-semibold text-ink">{label}</span>
          {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
        </span>
      ) : null}
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
          checked ? "bg-brand-600" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 transform rounded-full bg-white shadow transition",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-brand-950/45 backdrop-blur-[3px] animate-fade"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-card shadow-float animate-rise sm:rounded-3xl",
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted transition hover:bg-paper-deep hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper/50 px-5 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = { xs: "size-7 text-[10px]", sm: "size-9 text-xs", md: "size-11 text-sm", lg: "size-14 text-base", xl: "size-20 text-xl" };
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-bold text-brand-800 ring-1 ring-brand-200", sizes[size], className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fotos de empleados en Storage o data URLs */}
      {src ? <img src={src} alt={name ?? "Foto"} className="size-full object-cover" /> : initials(name)}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-brand-600", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div> : null}
      <p className="text-sm font-bold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-sky-200 bg-sky-100/60 text-[#215b6b]",
    success: "border-brand-200 bg-brand-50 text-brand-900",
    warning: "border-citrus-200 bg-citrus-100/70 text-[#7a5a12]",
    danger: "border-clay-200 bg-clay-100 text-clay-500",
  };
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-xs leading-relaxed", styles[variant], className)}>
      {title ? <p className="mb-0.5 font-bold">{title}</p> : null}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p> : null}
        <h1 className="font-display text-[2rem] leading-tight text-ink sm:text-[2.4rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "brand" | "citrus" | "clay" | "sky";
  className?: string;
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700",
    citrus: "bg-citrus-100 text-[#9a6d14]",
    clay: "bg-clay-100 text-clay-500",
    sky: "bg-sky-100 text-[#2a6a7b]",
  };
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-[1.7rem]">{value}</p>
          {hint ? <p className="mt-1 text-[11px] leading-relaxed text-muted">{hint}</p> : null}
        </div>
        {icon ? <span className={cn("flex size-10 items-center justify-center rounded-xl", tones[tone])}>{icon}</span> : null}
      </div>
    </Card>
  );
}

export function ProgressBar({ value, tone = "brand", className }: { value: number; tone?: "brand" | "citrus" | "clay"; className?: string }) {
  const tones = { brand: "bg-brand-500", citrus: "bg-citrus-400", clay: "bg-clay-400" };
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-paper-deep", className)}>
      <div className={cn("h-full rounded-full transition-all duration-700", tones[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: string; label: string; count?: number }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto rounded-xl border border-line bg-card p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition",
            value === tab.value ? "bg-brand-950 text-white shadow-sm" : "text-muted hover:bg-paper-deep hover:text-ink",
          )}
        >
          {tab.label}
          {typeof tab.count === "number" ? (
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", value === tab.value ? "bg-white/15" : "bg-paper-deep")}>{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-xs leading-relaxed text-muted">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
        <Check className="size-3" />
      </span>
      <span>{children}</span>
    </li>
  );
}
