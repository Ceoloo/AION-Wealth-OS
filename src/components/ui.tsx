"use client";

import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Parameters<typeof clsx>): string {
  return twMerge(clsx(inputs));
}

// ---- Card ----
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ink-line bg-ink-card p-4 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

// ---- Button ----
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-teal text-ink font-semibold hover:bg-teal/90",
    secondary: "bg-navy-muted text-cloud hover:bg-navy border border-ink-line",
    ghost: "bg-transparent text-cloud-muted hover:text-cloud hover:bg-ink-soft",
    danger: "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25",
  };
  return (
    <button
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---- Badge ----
type BadgeTone = "neutral" | "ok" | "warn" | "danger" | "teal";
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-ink-soft text-cloud-muted border-ink-line",
    ok: "bg-ok/15 text-ok border-ok/40",
    warn: "bg-warn/15 text-warn border-warn/40",
    danger: "bg-danger/15 text-danger border-danger/40",
    teal: "bg-teal/15 text-teal border-teal/40",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---- Field wrapper ----
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 block text-sm font-medium text-cloud">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-cloud-faint">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-ink-line bg-ink-soft px-3 py-2 text-sm text-cloud placeholder:text-cloud-faint focus:border-teal focus:outline-none min-h-[44px]";

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputBase, className)} {...props} />;
});

export const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(inputBase, "min-h-[80px]", className)} {...props} />;
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(inputBase, className)} {...props}>
      {children}
    </select>
  );
});

// ---- Section header ----
export function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-cloud">{title}</h2>
      {subtitle ? <p className="text-sm text-cloud-muted">{subtitle}</p> : null}
    </div>
  );
}

// ---- Empty state ----
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="text-center">
      <p className="font-medium text-cloud">{title}</p>
      <p className="mt-1 text-sm text-cloud-muted">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </Card>
  );
}

// ---- Disclaimer note ----
export function Disclaimer({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-ink-line bg-ink-soft px-3 py-2 text-xs text-cloud-faint">
      {children}
    </p>
  );
}
