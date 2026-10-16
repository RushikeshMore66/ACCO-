import { NextRequest, NextResponse } from "next/server";
import { backendFetchWithRefresh } from "@/lib/auth/session";

/** Regenerates recovery codes (requires a current TOTP code). */
export async function POST(request: NextRequest) {
  const { code } = (await request.json().catch(() => ({}))) as { code?: string };
  const response = await backendFetchWithRefresh("/auth/mfa/recovery-codes", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!response) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
