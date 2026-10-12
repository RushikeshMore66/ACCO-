"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { SidebarWithState } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { DemoModeBanner } from "@/components/shared/DemoModeBanner";

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
    "/settings/team": "Team & Users",
    "/policies": "Collection Policies",
    "/settings/audit": "Activity & Audit Log",
    "/settings": "Settings",
    "/settings/profile": "Profile",
  };
  return titleMap[pathname] ?? "ACCO";
}

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const title = usePageTitle();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Client-side safety guard for transitions / session invalidation
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      if (
        pathname &&
        pathname !== "/dashboard" &&
        pathname !== "/" &&
        pathname.startsWith("/") &&
        !pathname.startsWith("//") &&
        !pathname.includes("://")
      ) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
      } else {
        router.push("/login");
      }
    }
  }, [isAuthenticated, isLoading, pathname, router]);

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
