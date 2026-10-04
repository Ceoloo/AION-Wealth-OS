"use client";

import { useApp } from "@/lib/store/provider";
import { Partners } from "@/components/Partners";
import { PageLoading } from "@/components/app/primitives";

export default function PartnersPage() {
  const { ready } = useApp();
  if (!ready) return <PageLoading />;
  return <Partners mode="manage" />;
}
