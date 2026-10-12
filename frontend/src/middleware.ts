import { NextResponse, type NextRequest } from "next/server";

/**
 * Global middleware for ACCO.
 *
 * Attaches the current request pathname as `x-pathname` header so Server
 * Components (such as protected layout and page guards) can inspect the
 * targeted route to preserve safe redirect targets (e.g. /login?next=/invoices).
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
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
