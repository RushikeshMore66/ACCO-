import { NextRequest, NextResponse } from "next/server";
import { API_BASE } from "@/lib/auth/tokens";

/**
 * BFF registration. Creates the organization + owner and returns { registered: true }.
 * The user then signs in (after verifying their email where the deployment requires it) —
 * owners must enrol MFA at first sign-in, so no session is created here.
 */
export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 400 });
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
    let detail = "Registration failed. Check your details and try again.";
    if (typeof errBody.detail === "string") detail = errBody.detail;
    else if (Array.isArray(errBody.detail) && errBody.detail[0]?.msg) {
      detail = String(errBody.detail[0].msg).replace(/^Value error, /, "");
    }
    return NextResponse.json({ detail }, { status: res.status });
  }

  return NextResponse.json({ registered: true }, { status: 201 });
}
