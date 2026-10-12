import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateSession, getSessionToken, setSessionCookie, clearSessionCookie } from "@/lib/auth/session";
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

  it("sets and clears session cookie properly", async () => {
    await setSessionCookie("new-token", 3600);
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "acco_session",
      "new-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 3600,
      })
    );

    await clearSessionCookie();
    expect(mockCookieStore.delete).toHaveBeenCalledWith("acco_session");
  });
});
