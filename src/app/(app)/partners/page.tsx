"use client";

import Link from "next/link";
import { useApp } from "@/lib/store/provider";
import { Partners } from "@/components/Partners";

export default function PartnersPage() {
  const { ready } = useApp();
  if (!ready) return <p className="text-sm text-cloud-faint">Loading…</p>;
  return (
    <div className="space-y-4">
      <Partners mode="manage" />
      <Link href="/today" className="block text-sm text-teal underline">
        ← Back to Today
      </Link>
    </div>
  );
}
