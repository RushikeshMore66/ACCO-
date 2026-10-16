import { NextResponse } from "next/server";
import { clearSessionCookies, getRefreshToken } from "@/lib/auth/session";
import { API_BASE } from "@/lib/auth/tokens";

/**
 * BFF logout handler — revokes the server-side session family, then clears the cookies.
 * Cookies are cleared even if the backend is unreachable.
 */
export async function POST() {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // best effort: the refresh token also expires on its own
    }
  }
  await clearSessionCookies();
  return NextResponse.json({ success: true });
}
