import { NextResponse } from "next/server";
import { API_BASE } from "./tokens";

/**
 * Forward a JSON body to an unauthenticated FastAPI auth endpoint and relay status + message.
 * Only `detail` strings are passed through; validation-error arrays are summarised.
 */
export async function forwardPublicAuthRequest(
  request: Request,
  path: string
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 400 });
  }
  let backend: Response;
  try {
    backend = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json(
      { detail: "Unable to reach the authentication service" },
      { status: 503 }
    );
  }
  const data = await backend.json().catch(() => ({}));
  let detail: string | undefined;
  if (typeof data.detail === "string") detail = data.detail;
  else if (Array.isArray(data.detail) && data.detail[0]?.msg) {
    detail = String(data.detail[0].msg).replace(/^Value error, /, "");
  }
  return NextResponse.json(
    { detail: detail ?? (backend.ok ? "OK" : "Request failed") },
    { status: backend.status }
  );
}
