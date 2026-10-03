import type { Metadata } from "next";
import "./globals.css";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: t.common.appName,
  description: t.landing.hero.subtitle,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={t.locale.slice(0, 2)}>
      <body>{children}</body>
    </html>
  );
}
