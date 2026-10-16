import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as handleProxy } from "@/app/api/proxy/[...path]/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({
  getSessionToken: vi.fn().mockResolvedValue("expired-access"),
}));

function proxyRequest(cookie?: string) {
  return new NextRequest("http://localhost:3000/api/proxy/invoices", {
    headers: cookie ? { cookie } : {},
  });
}

describe("BFF proxy token refresh", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("refreshes once on 401, retries with the new token and sets new cookies", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        calls.push({ url, auth: headers.get("Authorization") });
        if (url.endsWith("/auth/refresh")) {
          return new Response(
            JSON.stringify({
              access_token: "fresh-access",
              expires_in: 900,
              refresh_token: "fresh-refresh-1",
              refresh_expires_in: 604800,
            }),
            { status: 200 }
          );
        }
        return headers.get("Authorization") === "Bearer fresh-access"
          ? new Response(JSON.stringify({ ok: true }), { status: 200 })
          : new Response("{}", { status: 401 });
      })
    );

    const res = await handleProxy(proxyRequest("acco_refresh=old-refresh-token-xyz"), {
      params: { path: ["invoices"] },
    });

    expect(res.status).toBe(200);
    expect(calls.map((c) => c.auth)).toEqual([
      "Bearer expired-access",
      null,
      "Bearer fresh-access",
    ]);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("acco_session=fresh-access");
    expect(setCookie).toContain("acco_refresh=fresh-refresh-1");
  });

  it("clears cookies when the refresh token is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 }))
    );
    const res = await handleProxy(proxyRequest("acco_refresh=revoked-refresh-token-1"), {
      params: { path: ["invoices"] },
    });
    expect(res.status).toBe(401);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("acco_session=;");
    expect(setCookie).toContain("acco_refresh=;");
  });

  it("does not forward browser cookies to the API", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await handleProxy(proxyRequest("acco_session=secret; acco_refresh=secret2"), {
      params: { path: ["invoices"] },
    });
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
      .headers as Headers;
    expect(headers.has("cookie")).toBe(false);
  });

  it("allows the audit and dashboard prefixes but not arbitrary ones", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    for (const prefix of ["audit-events", "dashboard"]) {
      const res = await handleProxy(proxyRequest(), { params: { path: [prefix] } });
      expect(res.status).toBe(200);
    }
    const blocked = await handleProxy(proxyRequest(), { params: { path: ["auth"] } });
    expect(blocked.status).toBe(403);
  });
});
