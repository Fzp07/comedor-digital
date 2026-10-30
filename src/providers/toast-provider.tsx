"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles: Record<ToastVariant, string> = {
  success: "border-brand-200 bg-brand-50 text-brand-900",
  error: "border-clay-200 bg-clay-100 text-clay-500",
  warning: "border-citrus-200 bg-citrus-100 text-[#7a5a12]",
  info: "border-sky-200 bg-sky-100 text-[#215b6b]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "info" }: { title: string; description?: string; variant?: ToastVariant }) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current.slice(-3), { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[120] flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm">
        {toasts.map((item) => {
          const Icon = icons[item.variant];
          return (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto flex w-full items-start gap-3 rounded-2xl border px-4 py-3 shadow-float animate-rise",
                styles[item.variant],
              )}
            >
              <Icon className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.description ? <p className="mt-0.5 text-xs leading-relaxed opacity-80">{item.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-full p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100"
                aria-label="Cerrar aviso"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast debe usarse dentro de ToastProvider");
  return context;
}
