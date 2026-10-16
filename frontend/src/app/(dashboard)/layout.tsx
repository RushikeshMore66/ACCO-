import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { needsMfaEnrollment, validateSession } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout/DashboardShell";

export const dynamic = "force-dynamic";

/**
 * Validates and sanitizes a requested route before using it as a redirect target.
 * Rejects external URLs, protocol-relative paths, root, and the default dashboard route.
 */
function getSafeNextParam(pathname: string | null): string | null {
  if (!pathname || pathname === "/" || pathname === "/dashboard" || pathname === "/login") {
    return null;
  }
  // Must be a safe relative path starting with / and not //, and not containing protocol/backslashes
  if (
    pathname.startsWith("/") &&
    !pathname.startsWith("//") &&
    !pathname.includes("://") &&
    !pathname.includes("\\")
  ) {
    return pathname;
  }
  return null;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await validateSession();

  if (!user) {
    if (await needsMfaEnrollment()) {
      redirect("/mfa/setup");
    }
    const headersList = await headers();
    const pathname = headersList.get("x-pathname");
    const safeNext = getSafeNextParam(pathname);

    if (safeNext) {
      redirect(`/login?next=${encodeURIComponent(safeNext)}`);
    }
    redirect("/login");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
