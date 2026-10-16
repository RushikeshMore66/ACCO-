import { NextRequest, NextResponse } from "next/server";
import { backendFetch, setSessionCookies } from "@/lib/auth/session";
import type { TokenPair } from "@/lib/auth/tokens";

/**
 * Confirms the first TOTP code. On success the freshly issued MFA-verified session is stored in
 * cookies; only the one-time recovery codes are returned to the browser.
 */
export async function POST(request: NextRequest) {
  const { code } = (await request.json().catch(() => ({}))) as { code?: string };
  const response = await backendFetch("/auth/mfa/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!response) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json(
      { detail: typeof data.detail === "string" ? data.detail : "Invalid verification code" },
      { status: response.status }
    );
  }
  await setSessionCookies(data.session as TokenPair);
  return NextResponse.json({ recovery_codes: data.recovery_codes });
}
