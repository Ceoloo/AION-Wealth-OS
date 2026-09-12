import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AION Wealth OS",
  description:
    "A mobile-first financial education and execution workspace (founder pilot v0.1). Educational only — not legal, tax, or financial advice.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1220",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-cloud font-sans antialiased">{children}</body>
    </html>
  );
}
