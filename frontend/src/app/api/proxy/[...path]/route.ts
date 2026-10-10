import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth/session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/**
 * BFF Proxy Route for all domain API requests.
 * 
 * Safely extracts the httpOnly session cookie and forwards it to the FastAPI
 * backend as a Bearer token. Ensures credentials are never exposed to browser JS.
 */
async function handleProxy(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // Restrict proxying to known safe domain prefixes
  const allowedPrefixes = ["customers", "invoices", "payments", "collections", "reports", "team", "receivables"];
  if (!allowedPrefixes.includes(params.path[0]) || params.path.includes("..") || params.path.includes(".")) {
    return NextResponse.json({ detail: "Forbidden proxy path" }, { status: 403 });
  }
  
  const path = params.path.map(encodeURIComponent).join("/");
  const token = await getSessionToken();
  const targetUrl = new URL(`${API_BASE}/${path}${request.nextUrl.search}`);

  const headers = new Headers(request.headers);
  headers.delete("host"); // Let fetch determine the host

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding"); // Let Next.js handle compression

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      { detail: "Unable to reach backend service" },
      { status: 503 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
