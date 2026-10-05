import {
  BookOpen,
  Briefcase,
  CalendarCheck,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Settings,
  Sparkles,
  Wallet,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The four destinations someone opens daily. These get the mobile tab bar. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: LayoutDashboard },
  { href: "/plan", label: "Plan", icon: ListChecks },
  { href: "/finances", label: "Money", icon: Wallet },
  { href: "/credit", label: "Credit", icon: CreditCard },
];

/** Everything else. Behind "More" on mobile; always visible on desktop. */
export const SECONDARY_NAV: NavItem[] = [
  { href: "/review", label: "Weekly review", icon: CalendarCheck },
  { href: "/business", label: "Business", icon: Briefcase },
  { href: "/partners", label: "Starter tools", icon: Sparkles },
  { href: "/learn", label: "Learn", icon: BookOpen },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: Settings };

/** Desktop sidebar groups. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [PRIMARY_NAV[0]!, PRIMARY_NAV[1]!, SECONDARY_NAV[0]!] },
  { label: "Finances", items: [PRIMARY_NAV[2]!, PRIMARY_NAV[3]!] },
  { label: "Grow", items: [SECONDARY_NAV[1]!, SECONDARY_NAV[2]!, SECONDARY_NAV[3]!] },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
