"use client";

import * as React from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { SessionProvider } from "@/components/providers/session-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SessionProvider>{children}</SessionProvider>
    </QueryProvider>
  );
}
