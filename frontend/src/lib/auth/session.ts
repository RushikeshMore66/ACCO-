import { cookies } from "next/headers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const SESSION_COOKIE = "acco_session";

/**
 * Set the JWT access token in an httpOnly, SameSite=Strict cookie.
 * This keeps the token out of JavaScript-accessible storage.
 */
export async function setSessionCookie(
  token: string,
  expiresInSeconds: number
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: expiresInSeconds,
  });
}

/**
 * Clear the session cookie (logout).
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Get the current JWT from the httpOnly cookie.
 * Returns null if no session exists.
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
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

export interface SessionUser {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role: "OWNER" | "ADMIN" | "FINANCE_MANAGER" | "COLLECTOR" | "VIEWER";
  created_at: string;
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
