"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { Logo } from "@/components/logo";
import { Alert, Button, Input, Label, Spinner } from "@/components/ui";
import { roleHome } from "@/lib/utils";

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export default function MfaPage() {
  const router = useRouter();
  const {
    session,
    profile,
    loading,
    securityLoading,
    assuranceLevel,
    refreshAssuranceLevel,
    signOut,
  } = useAuth();

  const [checking, setChecking] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || securityLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (assuranceLevel === "aal2") {
      router.replace(roleHome(profile?.role));
      return;
    }

    let cancelled = false;
    void supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (cancelled) return;
      if (listError) {
        setError(listError.message);
        setChecking(false);
        return;
      }
      const verified = data?.totp?.find((factor) => factor.status === "verified");
      setFactorId(verified?.id ?? null);
      setChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, [assuranceLevel, loading, profile?.role, router, securityLoading, session]);

  async function startEnrollment() {
    setBusy(true);
    setError(null);
    try {
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const stale = existing?.all?.find((factor) => factor.status === "unverified");
      if (stale) await supabase.auth.mfa.unenroll({ factorId: stale.id });

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Comedor Digital",
      });
      if (enrollError || !data?.totp) {
        setError(enrollError?.message ?? "No pudimos iniciar la inscripción del segundo factor.");
        return;
      }
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    const target = enrollment?.factorId ?? factorId;
    if (!target) {
      setError("Tu cuenta no tiene un factor configurado. Actívalo para continuar.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Ingresa el código de 6 dígitos de tu aplicación autenticadora.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: target,
      });
      if (challengeError || !challenge) {
        setError(challengeError?.message ?? "No pudimos iniciar la verificación.");
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: target,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      await supabase.rpc("set_my_mfa_enrolled", { p_enrolled: true });
      await refreshAssuranceLevel();
      router.replace(roleHome(profile?.role));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-paper">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6 sm:px-8">
        <Logo />
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted hover:text-ink"
        >
          <LogOut className="size-3.5" /> Cerrar sesión
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 pb-16 sm:px-8">
        <div className="rounded-3xl border border-line bg-card p-6 shadow-[0_24px_60px_-40px_rgba(15,40,35,0.5)] sm:p-8">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <ShieldCheck className="size-6" />
          </span>
          <h1 className="mt-4 font-display text-3xl leading-tight text-ink">Verificación en dos pasos</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {enrollment
              ? "Escanea el código y confirma con el código de 6 dígitos para activar la protección."
              : "Tu cuenta requiere un segundo factor para acceder a datos de empleados y funciones administrativas."}
          </p>

          {error ? <Alert variant="danger" className="mt-4">{error}</Alert> : null}

          {loading || securityLoading || checking ? (
            <div className="mt-8 flex items-center justify-center gap-2 py-8 text-xs text-muted">
              <Spinner className="size-4" /> Verificando tu cuenta…
            </div>
          ) : enrollment ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-[auto,1fr]">
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-2xl border border-line bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={enrollment.qrCode} alt="Código QR para configurar el segundo factor" className="size-44" />
                </div>
                <p className="max-w-[12rem] text-center text-[9px] leading-relaxed text-muted">
                  Google Authenticator, Authy, 1Password o cualquier app TOTP.
                </p>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-line bg-paper/40 px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Clave manual</p>
                  <p className="mt-1 break-all font-mono text-[11px] font-bold text-ink">{enrollment.secret}</p>
                </div>
                <div>
                  <Label htmlFor="mfa-code">Código de 6 dígitos</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="text-center font-mono text-lg tracking-[0.4em]"
                  />
                </div>
                <Button onClick={() => void verifyCode()} loading={busy} className="w-full" icon={<KeyRound className="size-4" />}>
                  Confirmar y activar
                </Button>
              </div>
            </div>
          ) : factorId ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-3">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-brand-700" />
                <p className="text-[11px] leading-relaxed text-brand-900">
                  Abre tu aplicación autenticadora y escribe el código vigente para esta cuenta.
                </p>
              </div>
              <div>
                <Label htmlFor="mfa-code">Código de 6 dígitos</Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                  className="text-center font-mono text-lg tracking-[0.4em]"
                />
              </div>
              <Button onClick={() => void verifyCode()} loading={busy} className="w-full" icon={<KeyRound className="size-4" />}>
                Verificar y entrar
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-citrus-200 bg-citrus-100/50 px-3.5 py-3">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-[#8a6110]" />
                <p className="text-[11px] leading-relaxed text-[#6d4e0d]">
                  Aún no tienes un segundo factor. Actívalo ahora con una aplicación autenticadora para continuar.
                </p>
              </div>
              <Button onClick={() => void startEnrollment()} loading={busy} className="w-full" icon={<KeyRound className="size-4" />}>
                Activar segundo factor
              </Button>
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-4 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" /> TOTP · sin contraseñas adicionales
            </span>
            <Link href="/privacidad" className="font-semibold text-brand-700 hover:underline">
              Aviso de privacidad
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
