import { forwardPublicAuthRequest } from "@/lib/auth/publicAuth";

/** Public BFF endpoint: forwards to FastAPI /auth/resend-verification (no session required). */
export async function POST(request: Request) {
  return forwardPublicAuthRequest(request, "/auth/resend-verification");
}
