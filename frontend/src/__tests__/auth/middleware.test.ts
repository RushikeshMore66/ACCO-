import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function jwtWithExp(exp: number): string {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64({ exp })}.sig`;
}

const now = () => Math.floor(Date.now() / 1000);

function request(cookie: string) {
  return new NextRequest("http://localhost:3000/dashboard", { headers: { cookie } });
}

describe("middleware session keep-alive", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("does nothing when the access token is still fresh", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await middleware(
      request(`acco_session=${jwtWithExp(now() + 600)}; acco_refresh=refresh-token-aaaa`)
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rotates an expired access token and exposes the new cookie to the rendering request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: "brand-new-access",
              expires_in: 900,
              refresh_token: "brand-new-refresh-1",
              refresh_expires_in: 604800,
            }),
            { status: 200 }
          )
      )
    );
    const res = await middleware(
      request(`acco_session=${jwtWithExp(now() - 10)}; acco_refresh=stale-refresh-token-1`)
    );
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("acco_session=brand-new-access");
    expect(setCookie).toContain("acco_refresh=brand-new-refresh-1");
    // downstream Server Components read the rewritten request cookie header
    expect(res.headers.get("x-middleware-request-cookie")).toContain("acco_session=brand-new-access");
  });

  it("clears cookies when the refresh token is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const res = await middleware(request("acco_refresh=revoked-refresh-token-2"));
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("acco_session=;");
    expect(setCookie).toContain("acco_refresh=;");
  });

  it("keeps cookies on a transient backend failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const res = await middleware(request("acco_refresh=transient-refresh-token3"));
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("passes the pathname header through", async () => {
    const res = await middleware(request(""));
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/dashboard");
  });
});
