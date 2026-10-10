import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { DemoModeProvider } from "@/providers/DemoModeProvider";

export const metadata: Metadata = {
  title: "ACCO — AI Accounts Receivable & Collections",
  description:
    "AI-assisted accounts receivable and collections platform for SMEs. Manage invoices, track payments, and automate collection workflows.",
  icons: {
    icon: "/assets/acco-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <DemoModeProvider>
          <AuthProvider>
            <QueryProvider>{children}</QueryProvider>
          </AuthProvider>
        </DemoModeProvider>
      </body>
    </html>
  );
}
