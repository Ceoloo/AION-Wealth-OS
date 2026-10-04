import * as React from "react";
import { Check, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/domain/money";

/**
 * Page-level building blocks shared by every screen. Built on shadcn
 * primitives so the component vocabulary is identical screen to screen: the
 * same header, the same section rhythm, the same field, the same empty state.
 */

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 lg:mb-8", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance lg:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-prose text-[0.95rem] text-muted-foreground text-pretty">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {title ? (
        <div className="flex items-end justify-between gap-4 pt-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-brand-surface text-primary">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="font-semibold text-foreground">{title}</p>
      <div className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">{body}</div>
      {action ? <div className="mt-5 flex w-full max-w-xs flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row sm:justify-center">{action}</div> : null}
    </div>
  );
}

/** Small-print that matters: what this is, and what it is not. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-2.5 rounded-xl border border-border bg-secondary/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground", className)}>
      <Info className="mt-px size-3.5 shrink-0 text-subtle" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

/**
 * A money figure. Tabular digits always; an unknown value is shown as an
 * em dash, never as $0.00.
 */
export function Money({
  cents,
  className,
}: {
  cents: number | null | undefined;
  className?: string;
}) {
  const unknown = cents === null || cents === undefined;
  return (
    <span className={cn("figure", unknown && "text-subtle", className)} title={unknown ? "Not recorded" : undefined}>
      {formatCents(cents)}
    </span>
  );
}

/** An inline error that names the problem and that nothing was lost. */
export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-danger/25 bg-danger-surface px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="grid gap-4 pt-4 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * Roving-tabindex radio behaviour, shared by every single-choice control so
 * the semantics are written once: one Tab stop for the whole group, arrow keys
 * move AND select (as native radios do), and re-activating the checked option
 * never clears it.
 */
function useRovingRadio<T>(options: readonly { value: T }[], value: T, onChange: (v: T) => void) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);

  function itemProps(i: number) {
    const selected = i === selectedIndex;
    return {
      ref: (el: HTMLButtonElement | null) => {
        refs.current[i] = el;
      },
      type: "button" as const,
      role: "radio" as const,
      "aria-checked": selected,
      tabIndex: selected || (selectedIndex === -1 && i === 0) ? 0 : -1,
      onClick: () => onChange(options[i]!.value),
      onKeyDown: (e: React.KeyboardEvent) => {
        const delta =
          e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (delta === 0) return;
        e.preventDefault();
        const next = (i + delta + options.length) % options.length;
        onChange(options[next]!.value);
        refs.current[next]?.focus();
      },
    };
  }
  return { selectedIndex, itemProps };
}

/** A compact segmented choice (Yes / No / Unknown). */
export function Segmented<T extends string | boolean | null>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly { label: string; value: T }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const { selectedIndex, itemProps } = useRovingRadio(options, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex w-full rounded-xl border border-border bg-secondary/40 p-1 sm:w-auto", className)}
    >
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          {...itemProps(i)}
          className={cn(
            "h-10 flex-1 rounded-lg px-4 text-sm font-medium transition-colors duration-150 sm:h-8 sm:flex-none",
            i === selectedIndex
              ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/35%)] ring-1 ring-foreground/10"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A full-width single choice where each option is a sentence. */
export function RadioCards<T extends string>({
  labelledBy,
  value,
  options,
  onChange,
}: {
  labelledBy: string;
  value: T | null;
  options: readonly { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  const { selectedIndex, itemProps } = useRovingRadio<T | null>(options, value, (v) => {
    if (v !== null) onChange(v);
  });
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-2">
      {options.map((o, i) => {
        const selected = i === selectedIndex;
        return (
          <button
            key={o.value}
            {...itemProps(i)}
            className={cn(
              "flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-[0.95rem] transition-colors duration-150",
              selected
                ? "border-primary/50 bg-brand-surface text-foreground"
                : "border-border bg-secondary/30 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
          >
            {o.label}
            <span
              aria-hidden
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
              )}
            >
              {selected ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
