import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import { ppEditorialNew } from "@/lib/fonts";
import "./globals.css";
import { AuthGate } from "@/components/auth/AuthGate";

export const metadata: Metadata = {
  title: "Lavoe",
  description: "AI for music production",
  generator: "Lavoe",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`font-sans ${GeistSans.variable} ${GeistMono.variable} ${ppEditorialNew.variable}`}
      >
        <AuthGate>{children}</AuthGate>
        <Analytics />
      </body>
    </html>
  );
}
