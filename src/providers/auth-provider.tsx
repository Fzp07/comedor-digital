"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const profileRequest = useRef(0);

  const loadProfile = useCallback(async (userId: string) => {
    const requestId = ++profileRequest.current;
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!mounted.current || requestId !== profileRequest.current) return;

    if (profileError) {
      setError(profileError.message);
      setProfile(null);
      return;
    }

    if (!data) {
      setError("Tu usuario no tiene perfil configurado. Contacta al administrador.");
      setProfile(null);
      return;
    }

    setError(null);
    setProfile(data as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) return;
    await loadProfile(session.user.id);
  }, [loadProfile, session]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    const safety = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 9000);

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        if (data.session?.user.id) {
          await loadProfile(data.session.user.id);
        }
      })
      .finally(() => {
        if (cancelled) return;
        window.clearTimeout(safety);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      if (nextSession?.user.id) {
        window.setTimeout(() => {
          if (!cancelled) void loadProfile(nextSession.user.id);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      mounted.current = false;
      window.clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, error, refreshProfile, signOut }),
    [session, profile, loading, error, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
