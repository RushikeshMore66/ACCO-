"use client";

import { SidebarWithState } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { DemoModeBanner } from "@/components/shared/DemoModeBanner";
import { usePathname } from "next/navigation";

/**
 * Page title map — derives the page title from the current pathname.
 * This avoids prop-drilling titles through every page component.
 */
function usePageTitle(): string {
  const pathname = usePathname();
  const titleMap: Record<string, string> = {
    "/dashboard": "Overview",
    "/collections": "Collections",
    "/collections/promises": "Payment Promises",
    "/collections/disputes": "Disputes",
    "/collections/payments": "Payments & Reconciliation",
    "/communications": "Communications",
    "/invoices": "Invoices",
    "/customers": "Customers",
    "/reports": "Reports",
    "/reports/intelligence": "Collection Intelligence",
    "/settings/team": "Team & Users",
    "/policies": "Collection Policies",
    "/settings/audit": "Activity & Audit Log",
    "/settings": "Settings",
    "/settings/profile": "Profile",
  };
  return titleMap[pathname] ?? "ACCO";
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const title = usePageTitle();

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
      <SidebarWithState />

      {/* Main content column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Demo mode banner */}
        <DemoModeBanner />

        {/* Top bar */}
        <TopBar title={title} />

        {/* Page content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto bg-surface"
          tabIndex={-1}
          aria-label="Main content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
