import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cookiesForTokens,
  decodeJwtExp,
  isAccessTokenFresh,
  mfaTicketCookie,
  refreshTokens,
  withCookies,
} from "@/lib/auth/tokens";
import { validateNewPassword } from "@/lib/auth/password";

function jwtWithExp(exp: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64({ exp, sub: "u" })}.sig`;
}

describe("JWT expiry helpers", () => {
  it("decodes exp without verifying the signature", () => {
    expect(decodeJwtExp(jwtWithExp(1_900_000_000))).toBe(1_900_000_000);
  });

  it("returns null for malformed or missing tokens", () => {
    expect(decodeJwtExp(undefined)).toBeNull();
    expect(decodeJwtExp("not-a-jwt")).toBeNull();
    expect(decodeJwtExp("a.%%%.c")).toBeNull();
  });

  it("treats tokens inside the 30s skew (or expired/missing) as stale", () => {
    const now = 1_000_000;
    expect(isAccessTokenFresh(jwtWithExp(now + 600), now)).toBe(true);
    expect(isAccessTokenFresh(jwtWithExp(now + 20), now)).toBe(false);
    expect(isAccessTokenFresh(jwtWithExp(now - 5), now)).toBe(false);
    expect(isAccessTokenFresh(undefined, now)).toBe(false);
  });
});

describe("cookie specs", () => {
  it("makes httpOnly strict cookies for access + refresh", () => {
    const specs = cookiesForTokens({
      access_token: "a",
      expires_in: 900,
      refresh_token: "r",
      refresh_expires_in: 604800,
    });
    expect(specs.map((s) => s.name)).toEqual(["acco_session", "acco_refresh"]);
    for (const spec of specs) {
      expect(spec.options.httpOnly).toBe(true);
      expect(spec.options.sameSite).toBe("strict");
    }
  });

  it("scopes the MFA ticket to /api/auth for five minutes", () => {
    const spec = mfaTicketCookie("t");
    expect(spec.options).toMatchObject({ path: "/api/auth", maxAge: 300, httpOnly: true });
  });

  it("rewrites a Cookie header", () => {
    expect(withCookies("a=1; acco_session=old; b=2", { acco_session: "new", b: null })).toBe(
      "a=1; acco_session=new"
    );
    expect(withCookies(null, { x: "1" })).toBe("x=1");
  });
});

describe("refreshTokens", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("shares one backend call between concurrent callers (single-flight)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "n", expires_in: 900, refresh_token: "r2" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([refreshTokens("same-token-1"), refreshTokens("same-token-1")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a.status).toBe("ok");
  });

  it("reports an invalid session when the backend rejects the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    expect(await refreshTokens("rejected-token")).toEqual({ status: "invalid" });
  });

  it("reports unavailable (keep cookies) on network or 5xx failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await refreshTokens("net-fail-token")).toEqual({ status: "unavailable" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    expect(await refreshTokens("five-hundred-token")).toEqual({ status: "unavailable" });
  });
});

describe("validateNewPassword", () => {
  it("mirrors the backend rule", () => {
    expect(validateNewPassword("short")).toMatch(/at least 12/);
    expect(validateNewPassword("aaaaaaaaaaaaaaaa")).toMatch(/repetitive/);
    expect(validateNewPassword("a-long-enough-passphrase")).toBeNull();
  });
});
