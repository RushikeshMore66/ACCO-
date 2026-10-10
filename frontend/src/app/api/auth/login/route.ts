import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth/session";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/**
 * BFF login route handler.
 *
 * The browser POSTs JSON { email, password }.
 * This handler converts to OAuth2PasswordRequestForm (x-www-form-urlencoded)
 * and forwards to the FastAPI /auth/login endpoint.
 * On success, sets an httpOnly session cookie and returns the UserResponse.
 *
 * NEVER returns the raw JWT to the browser — it stays server-side only.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { detail: "Invalid request body" },
      { status: 400 }
    );
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { detail: "Email and password are required" },
      { status: 400 }
    );
  }

  // Build OAuth2PasswordRequestForm payload
  const formData = new URLSearchParams();
  formData.set("username", email.trim().toLowerCase());
  formData.set("password", password);

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(`${API_BASE}/auth/login`, {
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

  if (!tokenResponse.ok) {
    const errBody = await tokenResponse.json().catch(() => ({}));
    return NextResponse.json(
      { detail: errBody.detail ?? "Authentication failed" },
      { status: tokenResponse.status }
    );
  }

  const tokenData: {
    access_token: string;
    token_type: string;
    expires_in: number;
  } = await tokenResponse.json();

  // Store the JWT in an httpOnly cookie — never expose it to JS
  await setSessionCookie(tokenData.access_token, tokenData.expires_in);

  // Fetch the user profile to return to the client
  let meResponse: Response;
  try {
    meResponse = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
  } catch {
    // Cookie was set — login succeeded even if /me fails
    return NextResponse.json({ success: true });
  }

  if (!meResponse.ok) {
    return NextResponse.json({ success: true });
  }

  const user = await meResponse.json();
  return NextResponse.json(user, { status: 200 });
}
