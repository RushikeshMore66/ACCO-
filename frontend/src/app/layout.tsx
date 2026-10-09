import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACCO — AI Accounts Receivable Agent",
  description: "Enterprise multi-tenant AR and automated collection platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
