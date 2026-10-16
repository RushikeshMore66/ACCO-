import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/auth/session";

/** Starts TOTP enrolment for the caller (works with the limited enrolment session). */
export async function POST() {
  const response = await backendFetch("/auth/mfa/setup", { method: "POST" });
  if (!response) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
