import { NextRequest, NextResponse } from "next/server";
import { setMfaTicket, setSessionCookies } from "@/lib/auth/session";
import { API_BASE, type TokenPair } from "@/lib/auth/tokens";

/**
 * BFF login route handler.
 *
 * The browser POSTs JSON { email, password }. This handler converts it to an OAuth2 form request
 * for FastAPI and translates the outcome:
 *   - tokens issued            -> httpOnly cookies are set, the user profile is returned
 *   - 202 MFA challenge        -> a 5-minute ticket cookie is set, { mfa_required: true } is returned
 *   - MFA enrolment required   -> a limited session cookie is set, { mfa_enrollment_required: true }
 *
 * Tokens are NEVER returned to the browser.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { detail: "Email and password are required" },
      { status: 400 }
    );
  }

  const formData = new URLSearchParams();
  formData.set("username", email.trim().toLowerCase());
  formData.set("password", password);

  let backend: Response;
  try {
    backend = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
  } catch {
    return NextResponse.json(
      { detail: "Unable to reach the authentication service" },
      { status: 503 }
    );
  }

  if (backend.status === 202) {
    const challenge: { mfa_ticket: string } = await backend.json();
    await setMfaTicket(challenge.mfa_ticket);
    return NextResponse.json({ mfa_required: true }, { status: 200 });
  }

  if (!backend.ok) {
    const errBody = await backend.json().catch(() => ({}));
    const response = NextResponse.json(
      { detail: typeof errBody.detail === "string" ? errBody.detail : "Authentication failed" },
      { status: backend.status }
    );
    const retryAfter = backend.headers.get("retry-after");
    if (retryAfter) response.headers.set("Retry-After", retryAfter);
    return response;
  }

  const tokens: TokenPair = await backend.json();
  await setSessionCookies(tokens);

  if (tokens.mfa_enrollment_required) {
    return NextResponse.json({ mfa_enrollment_required: true }, { status: 200 });
  }

  let me: Response;
  try {
    me = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
  } catch {
    return NextResponse.json({ success: true });
  }
  if (!me.ok) return NextResponse.json({ success: true });
  return NextResponse.json(await me.json(), { status: 200 });
}
