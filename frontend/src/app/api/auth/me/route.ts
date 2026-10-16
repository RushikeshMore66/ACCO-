import { NextResponse } from "next/server";
import { backendFetchWithRefresh } from "@/lib/auth/session";

/**
 * BFF /me route — reads the JWT from the httpOnly cookie (refreshing it once if it has
 * expired) and forwards to FastAPI /auth/me. Returns the UserResponse to the client.
 */
export async function GET() {
  const response = await backendFetchWithRefresh("/auth/me");

  if (!response) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  if (!response.ok) {
    if (response.status === 403) {
      return NextResponse.json(
        { detail: "Additional verification required" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { detail: "Session expired or invalid" },
      { status: 401 }
    );
  }

  const user = await response.json();
  return NextResponse.json(user);
}
