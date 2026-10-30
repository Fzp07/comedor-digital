"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { AppShell, FullScreenLoader } from "@/components/app-shell";
import { Button } from "@/components/ui";
import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, profile, loading, error, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, router, session]);

  if (loading) return <FullScreenLoader />;
  if (!session) return <FullScreenLoader label="Redirigiendo al inicio de sesión…" />;

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-bold text-ink">No pudimos cargar tu perfil</p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
          {error ?? "Verifica tu conexión e intenta de nuevo. Si el problema persiste, contacta al administrador."}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" onClick={() => window.location.reload()}>Reintentar</Button>
          <Button
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      {children}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-4 text-[10px] text-muted no-print">
        <span>Comedor Digital · Piloto 2026 · Datos tratados según Ley 1581 de 2012</span>
        <Link href="/privacidad" className="font-semibold text-brand-700 hover:underline">Aviso de privacidad</Link>
      </div>
    </AppShell>
  );
}
