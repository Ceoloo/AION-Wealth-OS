"use client";

import { AppStateProvider } from "@/lib/store/provider";
import { SessionGate } from "@/components/SessionGate";
import { AppShell } from "@/components/shell/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <AppShell>
        <SessionGate>{children}</SessionGate>
      </AppShell>
    </AppStateProvider>
  );
}
