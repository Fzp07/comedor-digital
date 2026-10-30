"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { roleHome } from "@/lib/utils";
import { FullScreenLoader } from "@/components/app-shell";

export default function AppIndexPage() {
  const router = useRouter();
  const { profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && profile) router.replace(roleHome(profile.role));
  }, [loading, profile, router]);

  return <FullScreenLoader label="Abriendo tu panel…" />;
}
