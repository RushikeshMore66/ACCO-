import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth/session";
import {
  API_BASE,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  MFA_TICKET_COOKIE,
  cookiesForTokens,
  refreshTokens,
} from "@/lib/auth/tokens";

/**
 * BFF Proxy Route for all domain API requests.
 *
 * Safely extracts the httpOnly session cookie and forwards it to the FastAPI
 * backend as a Bearer token. Ensures credentials are never exposed to browser JS.
 *
 * When the backend answers 401 (expired access token) and a refresh cookie exists, the token pair
 * is rotated once (single-flight across parallel requests), the request is retried and the new
 * cookies are attached to the response. A refresh the backend rejects clears the session cookies.
 */
const ALLOWED_PREFIXES = [
  "customers",
  "invoices",
  "payments",
  "collections",
  "reports",
  "team",
  "receivables",
  "dashboard",
  "audit-events",
];

async function callBackend(
  request: NextRequest,
  targetUrl: string,
  token: string | null,
  body: ArrayBuffer | undefined
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.delete("host"); // Let fetch determine the host
  headers.delete("cookie"); // Browser cookies are BFF-only; never forwarded to the API
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });
}

async function handleProxy(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // Restrict proxying to known safe domain prefixes
  if (
    !ALLOWED_PREFIXES.includes(params.path[0]) ||
    params.path.includes("..") ||
    params.path.includes(".")
  ) {
    return NextResponse.json({ detail: "Forbidden proxy path" }, { status: 403 });
  }

  const path = params.path.map(encodeURIComponent).join("/");
  const targetUrl = new URL(`${API_BASE}/${path}${request.nextUrl.search}`).toString();
  let token = await getSessionToken();

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  try {
    let response = await callBackend(request, targetUrl, token, body);
    let refreshedCookies: ReturnType<typeof cookiesForTokens> | null = null;
    let clearCookies = false;

    const refreshToken = request.cookies.get?.(REFRESH_COOKIE)?.value;
    if (response.status === 401 && refreshToken) {
      const result = await refreshTokens(refreshToken);
      if (result.status === "ok") {
        token = result.tokens.access_token;
        refreshedCookies = cookiesForTokens(result.tokens);
        response = await callBackend(request, targetUrl, token, body);
      } else if (result.status === "invalid") {
        clearCookies = true;
      }
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding"); // Let Next.js handle compression
    responseHeaders.delete("set-cookie"); // The API never sets browser cookies through the BFF

    const out = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
    if (refreshedCookies) {
      for (const spec of refreshedCookies) out.cookies.set(spec.name, spec.value, spec.options);
    } else if (clearCookies) {
      out.cookies.delete(SESSION_COOKIE);
      out.cookies.delete(REFRESH_COOKIE);
      out.cookies.delete(MFA_TICKET_COOKIE);
    }
    return out;
  } catch {
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
