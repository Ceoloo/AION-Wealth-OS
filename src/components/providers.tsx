"use client";

import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";

/**
 * App-wide client providers. `reducedMotion="user"` makes every Motion
 * animation honour the OS setting — the CSS reduced-motion rule can't reach
 * JS-driven animation on its own.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster position="top-center" />
    </MotionConfig>
  );
}
