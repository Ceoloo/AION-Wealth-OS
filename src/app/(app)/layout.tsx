"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppStateProvider, useApp } from "@/lib/store/provider";
import { SessionGate } from "@/components/SessionGate";
import { cn } from "@/components/ui";

const NAV = [
  { href: "/today", label: "Today", icon: "◎" },
  { href: "/plan", label: "My Plan", icon: "✓" },
  { href: "/finances", label: "Finances", icon: "$" },
  { href: "/business", label: "Business", icon: "▤" },
  { href: "/learn", label: "Learn", icon: "◈" },
];

function DemoBanner() {
  const { sessionState } = useApp();
  if (sessionState !== "demo") return null;
  return (
    <div className="border-b border-warn/40 bg-warn/10 px-4 py-1.5 text-center text-xs text-warn">
      <strong>Synthetic demo</strong> — example data only, saved in this browser. Don&apos;t enter real
      figures.{" "}
      <Link href="/signin" className="underline">
        Sign in to use your own
      </Link>
    </div>
  );
}

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-10 border-t border-ink-line bg-ink/95 backdrop-blur">
      <ul className="mx-auto flex max-w-app items-stretch justify-between px-1 py-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[11px]",
                  active ? "text-teal" : "text-cloud-faint hover:text-cloud-muted",
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <div className="mx-auto flex min-h-screen max-w-app flex-col">
        <header className="sticky top-0 z-10 border-b border-ink-line bg-ink/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <Link href="/today" className="text-sm font-bold tracking-wide text-cloud">
              AION <span className="text-teal">Wealth OS</span>
            </Link>
            <Link href="/settings" className="text-xs text-cloud-faint hover:text-cloud">
              Settings
            </Link>
          </div>
        </header>
        <DemoBanner />
        <main className="flex-1 px-4 py-4 pb-6">
          <SessionGate>{children}</SessionGate>
        </main>
        <BottomNav />
      </div>
    </AppStateProvider>
  );
}
