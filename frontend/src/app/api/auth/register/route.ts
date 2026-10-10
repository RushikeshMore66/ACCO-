import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth/session";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { detail: "Invalid request body" },
      { status: 400 }
    );
  }

  const { name, email, password } = body;
  if (!name || !email || !password) {
    return NextResponse.json(
      { detail: "Name, email, and password are required" },
      { status: 400 }
    );
  }

  const orgName = `${name}'s Organization`;
  const orgSlug = `org-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: name,
        email: email.trim().toLowerCase(),
        password: password,
        organization_name: orgName,
        organization_slug: orgSlug,
      }),
    });
  } catch {
    return NextResponse.json(
      { detail: "Unable to reach the authentication service" },
      { status: 503 }
    );
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    return NextResponse.json(
      { detail: errBody.detail ?? "Registration failed" },
      { status: res.status }
    );
  }

  // Now log the user in
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
      { detail: "Registration succeeded but login failed" },
      { status: 503 }
    );
  }

  if (!tokenResponse.ok) {
    const errBody = await tokenResponse.json().catch(() => ({}));
    return NextResponse.json(
      { detail: errBody.detail ?? "Authentication failed after registration" },
      { status: tokenResponse.status }
    );
  }

  const tokenData: {
    access_token: string;
    token_type: string;
    expires_in: number;
  } = await tokenResponse.json();

  await setSessionCookie(tokenData.access_token, tokenData.expires_in);

  return NextResponse.json({ success: true });
}
