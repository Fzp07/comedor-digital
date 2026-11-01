"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Fingerprint,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { Logo } from "@/components/logo";
import { Alert, Button, Input, Label } from "@/components/ui";
import { mfaChallengeRequired } from "@/lib/mfa";
import { roleHome } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const { session, profile, loading, mfaRequired, assuranceLevel, securityLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loading || securityLoading || !session || !profile) return;
    if (mfaChallengeRequired(profile, mfaRequired, assuranceLevel)) {
      router.replace("/login/mfa");
      return;
    }
    router.replace(roleHome(profile.role));
  }, [assuranceLevel, loading, mfaRequired, profile, router, securityLoading, session]);

  async function signIn(nextEmail: string, nextPassword: string) {
    setError(null);
    setNotice(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: nextEmail.trim(),
      password: nextPassword,
    });
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes("invalid login")
          ? "Correo o contraseña incorrectos. Verifica los datos e intenta de nuevo."
          : signInError.message,
      );
      return false;
    }
    return true;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const ok = await signIn(email, password);
    if (!ok) setSubmitting(false);
  }

  async function handleReset() {
    if (!email.trim()) {
      setError("Escribe tu correo para enviarte el enlace de recuperación.");
      return;
    }
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    });
    if (resetError) setError(resetError.message);
    else setNotice("Te enviamos un enlace de recuperación. Revisa tu correo corporativo.");
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-brand-950 px-10 py-12 text-white lg:flex lg:flex-col xl:px-16">
        <div className="pointer-events-none absolute -right-40 -top-32 size-[32rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-brand-700/40 blur-3xl" />
        <div className="pointer-events-none absolute right-16 top-40 size-24 rounded-full bg-citrus-400/20 blur-2xl" />

        <div className="relative z-10">
          <Logo dark />
        </div>

        <div className="relative z-10 my-auto max-w-[36rem] py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-brand-100 backdrop-blur">
            <Sparkles className="size-3.5 text-citrus-300" />
            Piloto 2026 · Colombia · Ley 1581
          </span>
          <h1 className="mt-6 font-display text-5xl leading-[1.02] text-white xl:text-6xl">
            El comedor de tu empresa,
            <span className="text-citrus-300"> sin filas y sin papeles.</span>
          </h1>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-brand-100/80">
            Un solo lugar para empleados, operadores y administración. Tiquetes digitales,
            validación en segundos y trazabilidad completa de cada consumo.
          </p>

          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {[
              { icon: QrCode, title: "QR dinámico", text: "Rota cada 45 segundos y no se puede compartir." },
              { icon: Fingerprint, title: "Huella opcional", text: "WebAuthn en el celular, sin guardar la huella." },
              { icon: ScanLine, title: "Validación offline", text: "La tablet sigue operando si se cae internet." },
              { icon: ShieldCheck, title: "Auditoría inmutable", text: "Cada acción sensible queda registrada." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm">
                <item.icon className="size-5 text-citrus-300" />
                <p className="mt-2 text-sm font-bold">{item.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-brand-100/65">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10 lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-[29rem]">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Logo />
            <span className="rounded-full bg-brand-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-800">Piloto</span>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600">Bienvenido de vuelta</p>
            <h2 className="mt-2 font-display text-4xl leading-tight text-ink">Entra a tu comedor.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Usa tu cuenta corporativa para acceder al panel que corresponde a tu rol.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="email">Correo corporativo</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@empresa.com"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <button type="button" onClick={handleReset} className="mb-1.5 text-[11px] font-semibold text-brand-700 hover:underline">
                  ¿La olvidaste?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted hover:bg-paper-deep hover:text-ink"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error ? <Alert variant="danger">{error}</Alert> : null}
            {notice ? <Alert variant="success">{notice}</Alert> : null}

            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              Entrar al panel
              {!submitting ? <ArrowRight className="size-4" /> : null}
            </Button>
          </form>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <UtensilsCrossed className="size-3.5" /> Comedor Digital · {new Date().getFullYear()}
            </span>
            <Link href="/privacidad" className="font-semibold text-brand-700 hover:underline">
              Aviso de privacidad
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
