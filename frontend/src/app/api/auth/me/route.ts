import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/auth/session";

/**
 * BFF /me route — reads the JWT from the httpOnly cookie and
 * forwards to FastAPI /auth/me. Returns the UserResponse to the client.
 */
export async function GET() {
  const response = await backendFetch("/auth/me");

  if (!response) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  if (!response.ok) {
    return NextResponse.json(
      { detail: "Session expired or invalid" },
      { status: 401 }
    );
  }

  const user = await response.json();
  return NextResponse.json(user);
}
