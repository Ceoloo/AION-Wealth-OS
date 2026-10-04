import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "AION Wealth OS",
  description:
    "A mobile-first financial education and execution workspace (founder pilot v0.1). Educational only — not legal, tax, or financial advice.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0f19",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark", geist.variable)}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
