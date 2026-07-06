"use client";

import * as React from "react";
import { logout as apiLogout } from "@/lib/api/services/auth";
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

  const signOut = React.useCallback(async () => {
    await apiLogout();
    setState({ status: "unauthenticated", me: null });
  }, []);

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
