import { redirect } from "next/navigation";
import { needsMfaEnrollment, validateSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Root route /:
 * Immediately redirects authenticated users with a valid session to the /dashboard,
 * and unauthenticated or expired sessions to /login.
 * Does not render any welcome page, intermediate UI, or loading screens.
 */
export default async function HomePage() {
  const user = await validateSession();

  if (user) {
    redirect("/dashboard");
  }

  if (await needsMfaEnrollment()) {
    redirect("/mfa/setup");
  }

  redirect("/login");
}
