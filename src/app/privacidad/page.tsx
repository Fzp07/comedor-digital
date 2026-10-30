import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";

export const metadata = { title: "Aviso de privacidad" };

const sections = [
  {
    title: "1. Responsable del tratamiento",
    body: "Comedor Digital S.A.S. es la responsable del tratamiento de los datos personales recolectados en esta plataforma. Canal de atención: soporte@comedordigital.co.",
  },
  {
    title: "2. Datos que tratamos",
    body: "Identificación y contacto laboral (código, documento, nombre, correo, teléfono, cargo, sede y centro de costo), fotografía de identificación, información de planes alimentarios, tiquetes, consumos, registros de acceso y, de forma opcional, una credencial biométrica WebAuthn. Nunca almacenamos imágenes de huellas ni plantillas biométricas crudas.",
  },
  {
    title: "3. Finalidades",
    body: "Gestionar el beneficio de alimentación, emitir y validar tiquetes, prevenir fraude, generar reportes de consumo, conciliar con cocina y cumplir obligaciones legales y contables. No usamos los datos para publicidad ni los vendemos a terceros.",
  },
  {
    title: "4. Datos biométricos",
    body: "La huella o passkey es opcional. La credencial se genera en el dispositivo del empleado y solo se almacena el identificador público y la clave pública. El empleado puede revocar el consentimiento y seguir usando QR o PIN como método alternativo.",
  },
  {
    title: "5. Conservación y seguridad",
    body: "Aplicamos mínimo privilegio, cifrado en tránsito y en reposo, RLS a nivel de base de datos, auditoría inmutable, MFA para roles administrativos y backups con recuperación a un punto en el tiempo. Los registros de consumo se conservan por el tiempo necesario para auditoría y conciliación.",
  },
  {
    title: "6. Derechos del titular",
    body: "Puedes conocer, actualizar, rectificar y solicitar la supresión de tus datos, así como revocar la autorización, escribiendo a soporte@comedordigital.co. Responderemos dentro de los términos de la Ley 1581 de 2012 y demás normas aplicables.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <Logo />
        <Link href="/login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="size-3.5" /> Volver al login
        </Link>
      </div>

      <div className="mt-10 rounded-2xl border border-brand-200 bg-brand-50 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">Ley 1581 de 2012 · Colombia</p>
            <h1 className="mt-1 font-display text-3xl text-ink">Aviso de privacidad y tratamiento de datos</h1>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Versión 1.0 · Vigente desde octubre de 2026. Este aviso aplica a empleados, operadores,
              supervisores, auditores y administradores de la plataforma Comedor Digital.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-7">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-sm font-extrabold text-ink">{section.title}</h2>
            <p className="mt-1.5 text-sm leading-7 text-muted">{section.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-line bg-card p-5 text-xs leading-relaxed text-muted">
        <p className="font-bold text-ink">Consentimiento informado</p>
        <p className="mt-1">
          Al activar la credencial biométrica, el empleado autoriza el uso de WebAuthn como método
          de verificación local. La huella permanece en el dispositivo y nunca se transmite a nuestros
          servidores. El consentimiento puede revocarse en cualquier momento desde el perfil.
        </p>
      </div>

      <div className="mt-8 text-center text-[10px] text-muted">
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">Volver al inicio de sesión</Link>
      </div>
    </main>
  );
}
