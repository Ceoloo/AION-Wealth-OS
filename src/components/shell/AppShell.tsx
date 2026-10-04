"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { FlaskConical, LogOut, Menu, UserRound } from "lucide-react";
import { useApp } from "@/lib/store/provider";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  isActive,
  NAV_GROUPS,
  PRIMARY_NAV,
  SECONDARY_NAV,
  SETTINGS_NAV,
  type NavItem,
} from "./nav";

/**
 * App shell. Mobile is the design baseline: a compact top bar and a floating
 * tab bar for the four daily destinations, with everything else one tap away
 * under "More". From `lg` up the same IA becomes a grouped sidebar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      {/* Ground texture lives on the shell, behind everything. */}
      <div aria-hidden className="ground-dots pointer-events-none fixed inset-x-0 top-0 h-[520px]" />

      <Sidebar />

      <div className="relative lg:pl-64">
        <MobileTopBar />
        <DemoBanner />
        <main className="pb-tabbar mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-panel lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/today" aria-label="AION Wealth OS — Today">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-xs font-medium text-subtle">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink item={item} active={isActive(pathname, item.href)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-border p-3">
        <SidebarLink item={SETTINGS_NAV} active={isActive(pathname, SETTINGS_NAV.href)} />
        <SessionChip />
      </div>
    </aside>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {active ? (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      ) : null}
      <Icon className={cn("size-4", active ? "text-primary" : "text-subtle group-hover:text-muted-foreground")} />
      {item.label}
    </Link>
  );
}

function SessionChip() {
  const { mode, userEmail, signOut, sessionState } = useApp();
  if (sessionState === "initializing" || sessionState === "signed_out") return null;
  const demo = mode === "demo";
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          demo ? "bg-warning-surface text-warning" : "bg-brand-surface text-primary",
        )}
      >
        {demo ? <FlaskConical className="size-3.5" /> : <UserRound className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">
          {demo ? "Synthetic demo" : (userEmail ?? "Signed in")}
        </p>
        <p className="text-xs text-subtle">{demo ? "Example data only" : "Your account"}</p>
      </div>
      <button
        onClick={signOut}
        className="rounded-md p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
        aria-label={demo ? "Leave the demo" : "Sign out"}
        title={demo ? "Leave the demo" : "Sign out"}
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        <Link href="/today" aria-label="AION Wealth OS — Today">
          <Logo />
        </Link>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <SETTINGS_NAV.icon className="size-[18px]" />
        </Link>
      </div>
    </header>
  );
}

function DemoBanner() {
  const { sessionState } = useApp();
  if (sessionState !== "demo") return null;
  return (
    <div className="border-b border-warning/20 bg-warning-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-xs text-warning sm:px-6 lg:px-10">
        <FlaskConical className="size-3.5 shrink-0" />
        <p>
          <strong className="font-semibold">Synthetic demo</strong> — example data only, saved in
          this browser. Don&apos;t enter real figures.{" "}
          <Link href="/signin" className="font-medium underline">
            Sign in to use your own
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function MobileTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = [...SECONDARY_NAV, SETTINGS_NAV].some((i) => isActive(pathname, i.href));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 px-3 lg:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch rounded-2xl border border-border bg-panel/90 p-1.5 shadow-[0_12px_32px_-8px_oklch(0_0_0/60%),0_2px_6px_oklch(0_0_0/30%)] backdrop-blur-xl">
        {PRIMARY_NAV.map((item) => (
          <li key={item.href} className="flex-1">
            <TabLink item={item} active={isActive(pathname, item.href)} />
          </li>
        ))}
        <li className="flex-1">
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "relative flex h-14 w-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors",
                  moreActive ? "text-primary" : "text-subtle hover:text-muted-foreground",
                )}
              >
                {moreActive ? <ActivePill /> : null}
                <Menu className="relative size-5" />
                <span className="relative">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl border-border bg-panel pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <SheetHeader className="text-left">
                <SheetTitle>More</SheetTitle>
                <SheetDescription>Reviews, business setup, starter tools and lessons.</SheetDescription>
              </SheetHeader>
              <ul className="grid grid-cols-1 gap-1 px-4">
                {[...SECONDARY_NAV, SETTINGS_NAV].map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-12 items-center gap-3 rounded-xl px-3 text-[0.95rem] transition-colors",
                          active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
                        )}
                      >
                        <span className={cn("flex size-8 items-center justify-center rounded-lg", active ? "bg-brand-surface text-primary" : "bg-secondary text-muted-foreground")}>
                          <Icon className="size-4" />
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-subtle hover:text-muted-foreground",
      )}
    >
      {active ? <ActivePill /> : null}
      <Icon className="relative size-5" />
      <span className="relative">{item.label}</span>
    </Link>
  );
}

/** Slides between tabs — motion that reports where you are, nothing more. */
function ActivePill() {
  return (
    <motion.span
      layoutId="tab-active"
      className="absolute inset-0 rounded-xl bg-brand-surface"
      transition={{ type: "spring", stiffness: 520, damping: 42 }}
    />
  );
}

