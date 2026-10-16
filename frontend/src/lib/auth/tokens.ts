/**
 * Edge-safe token helpers shared by middleware, route handlers and server components.
 * (No `next/headers` import: this module must also run in the Edge runtime.)
 *
 * Cookies (all httpOnly, SameSite=Strict, Secure in production):
 *   acco_session     access JWT   (path /)          sent to pages + BFF
 *   acco_refresh     refresh token (path /)         needed by middleware + BFF; never exposed to JS
 *   acco_mfa_ticket  5-minute MFA challenge ticket  (path /api/auth)
 */

export const SESSION_COOKIE = "acco_session";
export const REFRESH_COOKIE = "acco_refresh";
export const MFA_TICKET_COOKIE = "acco_mfa_ticket";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** Refresh slightly before expiry so a request never carries a token about to lapse. */
export const REFRESH_SKEW_SECONDS = 30;

export interface TokenPair {
  access_token: string;
  expires_in: number;
  refresh_token?: string | null;
  refresh_expires_in?: number | null;
  mfa_enrollment_required?: boolean;
}

export interface CookieSpec {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "strict";
    path: string;
    maxAge: number;
  };
}

function baseOptions(path: string, maxAge: number): CookieSpec["options"] {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path,
    maxAge,
  };
}

/** Cookies to set for a freshly issued token pair. */
export function cookiesForTokens(tokens: TokenPair): CookieSpec[] {
  // The access cookie outlives the JWT on purpose: an expired token triggers a refresh
  // (middleware / proxy) instead of silently looking like "logged out".
  const accessMaxAge = tokens.refresh_token
    ? (tokens.refresh_expires_in ?? tokens.expires_in)
    : tokens.expires_in;
  const specs: CookieSpec[] = [
    {
      name: SESSION_COOKIE,
      value: tokens.access_token,
      options: baseOptions("/", accessMaxAge),
    },
  ];
  if (tokens.refresh_token) {
    specs.push({
      name: REFRESH_COOKIE,
      value: tokens.refresh_token,
      options: baseOptions("/", tokens.refresh_expires_in ?? 60 * 60 * 24 * 7),
    });
  }
  return specs;
}

export function mfaTicketCookie(ticket: string): CookieSpec {
  return {
    name: MFA_TICKET_COOKIE,
    value: ticket,
    options: baseOptions("/api/auth", 5 * 60),
  };
}

/** Unix-seconds expiry of a JWT without verifying it (verification happens in the backend). */
export function decodeJwtExp(token: string | undefined | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export function isAccessTokenFresh(
  token: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const exp = decodeJwtExp(token);
  return exp !== null && exp - REFRESH_SKEW_SECONDS > nowSeconds;
}

export type RefreshResult =
  | { status: "ok"; tokens: TokenPair }
  | { status: "invalid" } // backend rejected the token: the session is over
  | { status: "unavailable" }; // transient failure: keep cookies, try again later

const inFlight = new Map<string, Promise<RefreshResult>>();

/**
 * Exchange a refresh token for a new pair. Concurrent calls with the same token share one
 * backend request (single-flight), so parallel page requests never trip replay detection.
 */
export function refreshTokens(refreshToken: string): Promise<RefreshResult> {
  const existing = inFlight.get(refreshToken);
  if (existing) return existing;

  const request = (async (): Promise<RefreshResult> => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403 || res.status === 422) {
        return { status: "invalid" };
      }
      if (!res.ok) return { status: "unavailable" };
      return { status: "ok", tokens: (await res.json()) as TokenPair };
    } catch {
      return { status: "unavailable" };
    }
  })().finally(() => {
    // Keep the settled promise briefly so late-arriving parallel callers reuse the result.
    setTimeout(() => inFlight.delete(refreshToken), 5000);
  });

  inFlight.set(refreshToken, request);
  return request;
}

/** Rewrite a Cookie request header so downstream server code sees refreshed values. */
export function withCookies(
  cookieHeader: string | null,
  updates: Record<string, string | null>
): string {
  const jar = new Map<string, string>();
  for (const part of (cookieHeader ?? "").split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) jar.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  for (const [name, value] of Object.entries(updates)) {
    if (value === null) jar.delete(name);
    else jar.set(name, value);
  }
  return Array.from(jar, ([k, v]) => `${k}=${v}`).join("; ");
}
