import { cn } from "@/lib/utils";

/**
 * The mark is the journey itself: three rising steps — stabilize, repair,
 * build — inside a rounded tile. Authored SVG, so it stays crisp at any size
 * and takes the brand colour from the token system.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary/12" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" className="fill-none stroke-primary/30" />
      <path
        d="M8 23 H13 V18 H18 V13 H24"
        className="fill-none stroke-primary"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="13" r="2.4" className="fill-primary" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      <span className="text-[0.95rem] font-semibold tracking-tight text-foreground">
        AION <span className="font-normal text-muted-foreground">Wealth OS</span>
      </span>
    </span>
  );
}
