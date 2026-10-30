import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo />
      <div className="mt-10 flex size-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
        <WifiOff className="size-7" />
      </div>
      <h1 className="mt-5 font-display text-4xl text-ink">Estás sin conexión.</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        La aplicación quedó guardada en tu dispositivo. Las validaciones que registres en modo
        offline se sincronizarán automáticamente cuando vuelvas a tener internet.
      </p>
      <div className="mt-7 flex gap-2">
        <Link href="/app/operador">
          <Button>Ir al modo operador</Button>
        </Link>
        <Link href="/">
          <Button variant="secondary">Reintentar</Button>
        </Link>
      </div>
    </main>
  );
}
