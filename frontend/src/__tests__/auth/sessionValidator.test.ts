import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateSession, getSessionToken, setSessionCookies, clearSessionCookies } from "@/lib/auth/session";
import { cookies } from "next/headers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

describe("validateSession", () => {
  const mockCookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (cookies as any).mockResolvedValue(mockCookieStore);
  });

  it("returns null when no session cookie is present", async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const user = await validateSession();
    expect(user).toBeNull();
  });

  it("returns user object when backend /auth/me returns 200 with valid session", async () => {
    mockCookieStore.get.mockReturnValue({ value: "valid-jwt-token" });

    const mockUser = {
      id: "usr-42",
      organization_id: "org-42",
      email: "finance@acco.local",
      full_name: "Finance Manager",
      is_active: true,
      role: "FINANCE_MANAGER",
      created_at: "2026-01-01T00:00:00Z",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockUser,
    }) as any;

    const user = await validateSession();
    expect(user).toEqual(mockUser);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/me"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer valid-jwt-token",
        }),
      })
    );
  });

  it("returns null when session is expired or invalid (backend returns 401)", async () => {
    mockCookieStore.get.mockReturnValue({ value: "expired-jwt-token" });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Token expired" }),
    }) as any;

    const user = await validateSession();
    expect(user).toBeNull();
  });

  it("returns null safely when network error occurs contacting backend", async () => {
    mockCookieStore.get.mockReturnValue({ value: "some-jwt-token" });

    global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const user = await validateSession();
    expect(user).toBeNull();
  });

  it("sets access and refresh cookies as httpOnly strict cookies", async () => {
    await setSessionCookies({
      access_token: "new-token",
      expires_in: 900,
      refresh_token: "refresh-token-value",
      refresh_expires_in: 604800,
    });
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "acco_session",
      "new-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        // outlives the 15-minute JWT so an expired token triggers a refresh, not a logout
        maxAge: 604800,
      })
    );
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "acco_refresh",
      "refresh-token-value",
      expect.objectContaining({ httpOnly: true, sameSite: "strict", maxAge: 604800 })
    );
  });

  it("limits the MFA-enrolment session to the access-token lifetime and sets no refresh cookie", async () => {
    await setSessionCookies({ access_token: "enroll", expires_in: 900, mfa_enrollment_required: true });
    expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "acco_session",
      "enroll",
      expect.objectContaining({ maxAge: 900 })
    );
  });

  it("clears every auth cookie", async () => {
    await clearSessionCookies();
    expect(mockCookieStore.delete).toHaveBeenCalledWith("acco_session");
    expect(mockCookieStore.delete).toHaveBeenCalledWith("acco_refresh");
    expect(mockCookieStore.delete).toHaveBeenCalledWith("acco_mfa_ticket");
  });
});
