import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

/**
 * BFF logout handler — clears the httpOnly session cookie.
 */
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
