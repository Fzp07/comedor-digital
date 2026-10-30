"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Logo } from "@/components/logo";
import { Spinner } from "@/components/ui";
import { roleHome } from "@/lib/utils";

export default function HomePage() {
  const router = useRouter();
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    router.replace(roleHome(profile?.role));
  }, [loading, profile?.role, router, session]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5">
      <Logo />
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Spinner className="size-4" />
        Preparando tu comedor…
      </div>
    </main>
  );
}
