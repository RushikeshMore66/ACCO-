import { NextRequest, NextResponse } from "next/server";
import { getMfaTicket, setSessionCookies } from "@/lib/auth/session";
import { API_BASE, type TokenPair } from "@/lib/auth/tokens";

/** Completes a sign-in that returned an MFA challenge: { code } or { recovery_code }. */
export async function POST(request: NextRequest) {
  const ticket = await getMfaTicket();
  if (!ticket) {
    return NextResponse.json(
      { detail: "Your sign-in session expired. Please sign in again." },
      { status: 401 }
    );
  }
  let body: { code?: string; recovery_code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 400 });
  }

  let backend: Response;
  try {
    backend = await fetch(`${API_BASE}/auth/mfa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mfa_ticket: ticket,
        code: body.code || undefined,
        recovery_code: body.recovery_code || undefined,
      }),
    });
  } catch {
    return NextResponse.json(
      { detail: "Unable to reach the authentication service" },
      { status: 503 }
    );
  }
  if (!backend.ok) {
    const err = await backend.json().catch(() => ({}));
    return NextResponse.json(
      { detail: typeof err.detail === "string" ? err.detail : "Verification failed" },
      { status: backend.status }
    );
  }
  const tokens: TokenPair = await backend.json();
  await setSessionCookies(tokens);
  const me = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  }).catch(() => null);
  return NextResponse.json(me && me.ok ? await me.json() : { success: true });
}
