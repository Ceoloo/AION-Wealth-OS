"use client";

import React from "react";
import { dollarsToCents } from "@/lib/domain/money";
import { Field, TextInput } from "./ui";

/**
 * A money field that supports a genuine "unknown" (empty) value. Empty string →
 * null (unknown). We never coerce a blank field to 0.
 */
export function MoneyInput({
  label,
  hint,
  valueCents,
  onChangeCents,
  allowNegative = false,
}: {
  label: string;
  hint?: string;
  valueCents: number | null;
  onChangeCents: (v: number | null) => void;
  allowNegative?: boolean;
}) {
  const [text, setText] = React.useState(valueCents === null ? "" : (valueCents / 100).toString());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setText(valueCents === null ? "" : (valueCents / 100).toString());
  }, [valueCents]);

  return (
    <Field label={label} hint={hint ?? "Leave blank if unknown — we won't assume zero."}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-cloud-faint">
          $
        </span>
        <TextInput
          inputMode="decimal"
          className="pl-6"
          value={text}
          placeholder="unknown"
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            if (raw.trim() === "") {
              setError(null);
              onChangeCents(null);
              return;
            }
            try {
              const cents = dollarsToCents(raw);
              if (!allowNegative && cents < 0) {
                setError("Must be zero or more");
                return;
              }
              setError(null);
              onChangeCents(cents);
            } catch {
              setError("Enter a number");
            }
          }}
        />
      </div>
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </Field>
  );
}
