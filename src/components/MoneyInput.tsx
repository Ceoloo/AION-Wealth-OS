"use client";

import React from "react";
import { dollarsToCents } from "@/lib/domain/money";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

/**
 * A money field that supports a genuine "unknown" (empty) value. Empty string →
 * null (unknown). We never coerce a blank field to 0.
 */
export function MoneyInput({
  label,
  hint,
  valueCents,
  onChangeCents,
  onValidityChange,
  allowNegative = false,
}: {
  label: string;
  hint?: string;
  valueCents: number | null;
  onChangeCents: (v: number | null) => void;
  /**
   * Told whenever the typed text stops (or starts) being a valid amount. An
   * invalid entry leaves the parent holding the last VALID value, so a form
   * that ignores this would save a stale figure while showing an error.
   */
  onValidityChange?: (valid: boolean) => void;
  allowNegative?: boolean;
}) {
  const id = React.useId();
  const [text, setText] = React.useState(valueCents === null ? "" : (valueCents / 100).toString());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setText(valueCents === null ? "" : (valueCents / 100).toString());
  }, [valueCents]);

  return (
    <Field label={label} htmlFor={id} hint={error ? undefined : (hint ?? "Leave blank if unknown — we won't assume zero.")}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-subtle sm:text-sm">
          $
        </span>
        <Input
          id={id}
          inputMode="decimal"
          className={cn("figure pl-7", error && "border-danger")}
          aria-invalid={error ? true : undefined}
          value={text}
          placeholder="unknown"
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            if (raw.trim() === "") {
              setError(null);
              onValidityChange?.(true);
              onChangeCents(null);
              return;
            }
            try {
              const cents = dollarsToCents(raw);
              if (!allowNegative && cents < 0) {
                setError("Must be zero or more");
                onValidityChange?.(false);
                return;
              }
              setError(null);
              onValidityChange?.(true);
              onChangeCents(cents);
            } catch {
              setError("Enter a number");
              onValidityChange?.(false);
            }
          }}
        />
      </div>
      {error ? <span className="block text-xs text-danger">{error}</span> : null}
    </Field>
  );
}

/**
 * Tracks which money fields in a form currently hold invalid text, so the
 * form can refuse to save instead of silently saving each field's last valid
 * value.
 */
export function useFieldValidity() {
  const [invalid, setInvalid] = React.useState<ReadonlySet<string>>(new Set());
  const report = React.useCallback(
    (key: string) => (valid: boolean) =>
      setInvalid((prev) => {
        if (valid === !prev.has(key)) return prev;
        const next = new Set(prev);
        if (valid) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  return { hasInvalid: invalid.size > 0, report };
}
