import { ApiError } from "./errors";
import { env } from "../env";

// Detect demo mode — true when NEXT_PUBLIC_DEMO_MODE=true
const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

interface RequestOptions extends RequestInit {
  /** Skip Bearer injection for public endpoints */
  public?: boolean;
}

/**
 * Core API client for ACCO.
 *
 * In a browser context, the JWT is stored in an httpOnly cookie and is
 * transparently attached by the browser. No explicit token management
 * is needed on the client side.
 *
 * The `Authorization` header is only injected in server contexts where
 * the cookie is not automatically sent (e.g. server-to-server calls
 * are handled separately via `lib/auth/session.ts`).
 *
 * IMPORTANT: In demo mode this client may be bypassed entirely by the
 * mock service layer. It never silently falls back to mock data after
 * a real API failure — that distinction is enforced at the call site.
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { public: isPublic, headers = {}, ...rest } = options;

  // Use the BFF proxy to securely attach the httpOnly cookie as a Bearer token
  const url = `/api/proxy${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const requestHeaders = new Headers(headers as HeadersInit);

  // Only set Content-Type for non-FormData bodies
  if (!(rest.body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      credentials: "include", // Send httpOnly session cookie
      headers: requestHeaders,
    });
  } catch (networkError) {
    throw new ApiError(
      0,
      "Network error: unable to reach the ACCO API",
      networkError
    );
  }

  if (response.status === 401) {
    // Redirect to login — token expired or invalid
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Session expired. Please sign in again.", null);
  }

  if (!response.ok) {
    let errorData: unknown;
    const text = await response.text();
    try {
      errorData = JSON.parse(text);
    } catch {
      errorData = text;
    }
    const detail =
      typeof errorData === "object" &&
      errorData !== null &&
      "detail" in errorData
        ? String((errorData as { detail: unknown }).detail)
        : `HTTP ${response.status}: ${response.statusText}`;
    throw new ApiError(response.status, detail, errorData);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/** Flag to help call sites distinguish demo from live */
export const isDemoMode = IS_DEMO;
