import { NextResponse, type NextRequest } from "next/server";
import {
  REFRESH_COOKIE,
  SESSION_COOKIE,
  cookiesForTokens,
  isAccessTokenFresh,
  refreshTokens,
  withCookies,
} from "@/lib/auth/tokens";

/**
 * Global middleware for ACCO.
 *
 * 1. Attaches the request pathname as `x-pathname` so Server Components (protected layout and
 *    page guards) can preserve safe redirect targets (e.g. /login?next=/invoices).
 * 2. Keeps sessions alive: when the access token is missing/expired but a refresh cookie exists,
 *    it rotates the pair *before* the page renders (Server Components cannot set cookies), so the
 *    page sees the new token and the browser receives the new cookies. A refresh the backend
 *    rejects clears the cookies; a transient backend failure leaves them untouched.
 */
export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const access = request.cookies.get(SESSION_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  let setCookies: ReturnType<typeof cookiesForTokens> | null = null;
  let clearCookies = false;

  if (refresh && !isAccessTokenFresh(access)) {
    const result = await refreshTokens(refresh);
    if (result.status === "ok") {
      setCookies = cookiesForTokens(result.tokens);
      requestHeaders.set(
        "cookie",
        withCookies(request.headers.get("cookie"), {
          [SESSION_COOKIE]: result.tokens.access_token,
          [REFRESH_COOKIE]: result.tokens.refresh_token ?? refresh,
        })
      );
    } else if (result.status === "invalid") {
      clearCookies = true;
      requestHeaders.set(
        "cookie",
        withCookies(request.headers.get("cookie"), {
          [SESSION_COOKIE]: null,
          [REFRESH_COOKIE]: null,
        })
      );
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (setCookies) {
    for (const spec of setCookies) response.cookies.set(spec.name, spec.value, spec.options);
  } else if (clearCookies) {
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api (API routes)
     * - /_next/static (static files)
     * - /_next/image (image optimization files)
     * - /assets (static asset files)
     * - /favicon.ico (favicon)
     */
    "/((?!api|_next/static|_next/image|assets|favicon.ico).*)",
  ],
};
