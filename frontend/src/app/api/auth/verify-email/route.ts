import { forwardPublicAuthRequest } from "@/lib/auth/publicAuth";

/** Public BFF endpoint: forwards to FastAPI /auth/verify-email (no session required). */
export async function POST(request: Request) {
  return forwardPublicAuthRequest(request, "/auth/verify-email");
}
