import { cookies } from "next/headers";

import {
  API_BASE,
  MFA_TICKET_COOKIE,
  REFRESH_COOKIE,
  SESSION_COOKIE,
  cookiesForTokens,
  mfaTicketCookie,
  refreshTokens,
  type TokenPair,
} from "./tokens";

/**
 * Persist a token pair in httpOnly, SameSite=Strict cookies. The browser's JavaScript never
 * sees either token.
 */
export async function setSessionCookies(tokens: TokenPair): Promise<void> {
  const cookieStore = await cookies();
  for (const spec of cookiesForTokens(tokens)) {
    cookieStore.set(spec.name, spec.value, spec.options);
  }
  cookieStore.delete(MFA_TICKET_COOKIE);
}

export async function setMfaTicket(ticket: string): Promise<void> {
  const cookieStore = await cookies();
  const spec = mfaTicketCookie(ticket);
  cookieStore.set(spec.name, spec.value, spec.options);
}

export async function getMfaTicket(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(MFA_TICKET_COOKIE)?.value ?? null;
}

/**
 * Clear every auth cookie (logout / failed refresh).
 */
export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
  cookieStore.delete(MFA_TICKET_COOKIE);
}

/**
 * Get the current access JWT from the httpOnly cookie.
 * Returns null if no session exists.
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_COOKIE)?.value ?? null;
}

/**
 * Forward a request to the FastAPI backend with the Bearer token from session.
 * Returns null if no session token is found.
 */
export async function backendFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Route-handler variant of backendFetch: if the access token is missing/expired, exchange the
 * refresh cookie once (single-flight), persist the new cookies and retry. Only usable where
 * cookies may be written (route handlers / server actions), never in server components.
 */
export async function backendFetchWithRefresh(
  path: string,
  init: RequestInit = {}
): Promise<Response | null> {
  const response = await backendFetch(path, init);
  if (response && response.status !== 401) return response;

  const refreshToken = await getRefreshToken();
  if (!refreshToken) return response;

  const result = await refreshTokens(refreshToken);
  if (result.status === "invalid") {
    await clearSessionCookies();
    return response;
  }
  if (result.status !== "ok") return response;

  await setSessionCookies(result.tokens);
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${result.tokens.access_token}`,
      "Content-Type": "application/json",
    },
  });
}

export interface SessionUser {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role: "OWNER" | "ADMIN" | "FINANCE_MANAGER" | "COLLECTOR" | "VIEWER";
  created_at: string;
  mfa_enabled?: boolean;
  email_verified?: boolean;
}

/**
 * Validates the session cookie against the FastAPI backend /auth/me.
 * Returns the user object if authenticated and session is valid;
 * returns null if unauthenticated, token is missing, expired, or invalid.
 */
export async function validateSession(): Promise<SessionUser | null> {
  try {
    const response = await backendFetch("/auth/me", { cache: "no-store" });
    if (!response || !response.ok) {
      return null;
    }
    const user = await response.json();
    return user as SessionUser;
  } catch {
    return null;
  }
}

/**
 * True when the session cookie holds the limited MFA-enrolment token (privileged user who has
 * not set up TOTP yet): the backend answers 403 "MFA enrollment required" to normal requests.
 */
export async function needsMfaEnrollment(): Promise<boolean> {
  try {
    const response = await backendFetch("/auth/me", { cache: "no-store" });
    if (!response || response.status !== 403) return false;
    const body = await response.json().catch(() => ({}));
    return body?.detail === "MFA enrollment required";
  } catch {
    return false;
  }
}
