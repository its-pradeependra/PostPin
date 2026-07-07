"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { logout as apiLogout } from "@/lib/api/services/auth";
import { setAccessToken } from "@/lib/api/client";
import { getMe, type Me } from "@/lib/api/services/me";

type Status = "loading" | "authenticated" | "unauthenticated";

interface SessionValue {
  status: Status;
  user: Me["user"] | null;
  company: Me["company"];
  subscription: Me["subscription"];
  /** True if the signed-in user has the given permission key. */
  can: (permission: string) => boolean;
  /** Re-fetch /me (call after login). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ status: Status; me: Me | null }>({
    status: "loading",
    me: null,
  });

  const refresh = React.useCallback(async () => {
    try {
      const me = await getMe();
      setState({ status: "authenticated", me });
    } catch {
      setState({ status: "unauthenticated", me: null });
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // If the browser restores a page from the back/forward cache (e.g. Back
  // after logout), the restored JS heap may still hold a pre-logout access
  // token. Drop it and re-validate against the server before trusting it.
  React.useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setAccessToken(null);
        void refresh();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [refresh]);

  const queryClient = useQueryClient();
  const signOut = React.useCallback(async () => {
    await apiLogout();
    setState({ status: "unauthenticated", me: null });
    // Drop all cached API data so nothing from this session can be shown
    // after logout (or leak to the next account that signs in).
    queryClient.clear();
  }, [queryClient]);

  const value = React.useMemo<SessionValue>(() => {
    const perms = new Set(state.me?.user.permissions ?? []);
    return {
      status: state.status,
      user: state.me?.user ?? null,
      company: state.me?.company ?? null,
      subscription: state.me?.subscription ?? null,
      can: (permission: string) => perms.has(permission),
      refresh,
      signOut,
    };
  }, [state, refresh, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}

/**
 * Where to land after login. Honors ?next= only when it is an internal path
 * that matches the user's area — a stale next from a previous session (e.g.
 * a client's /app path lingering when a superadmin signs in) must never win
 * over the role's home, and external origins are never followed.
 */
export function postLoginPath(next: string | null | undefined, isPlatformStaff: boolean): string {
  const home = isPlatformStaff ? "/admin" : "/app";
  if (!next || !next.startsWith("/") || next.startsWith("//")) return home;
  const nextIsAdmin = next === "/admin" || next.startsWith("/admin/");
  return nextIsAdmin === isPlatformStaff ? next : home;
}

/**
 * For guest-only pages (login/signup): bounce an already-authenticated user
 * to their dashboard.
 */
export function useRedirectIfAuthenticated(next?: string | null): void {
  const router = useRouter();
  const { status, user } = useSession();

  React.useEffect(() => {
    if (status !== "authenticated" || !user) return;
    router.replace(postLoginPath(next, user.is_platform_staff));
  }, [status, user, next, router]);
}
