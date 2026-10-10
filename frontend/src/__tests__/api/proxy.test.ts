import { describe, it, expect, vi } from "vitest";
import { GET as handleProxy } from "@/app/api/proxy/[...path]/route";
import { NextRequest } from "next/server";

// We mock the session token fetcher to simulate logged-in state
vi.mock("@/lib/auth/session", () => ({
  getSessionToken: vi.fn().mockResolvedValue("mock-jwt-token"),
}));

describe("BFF Proxy Security", () => {
  it("rejects unauthorized prefixes (path traversal protection)", async () => {
    // Create a request targeting an unauthorized prefix
    const req = new NextRequest("http://localhost:3000/api/proxy/internal-admin");
    const res = await handleProxy(req, { params: { path: ["internal-admin"] } });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.detail).toBe("Forbidden proxy path");
  });

  it("rejects path traversal attempts within allowed prefixes", async () => {
    const req = new NextRequest("http://localhost:3000/api/proxy/invoices/../../internal");
    
    // params.path array in Next.js represents the segments.
    // If a user crafts a URL, Next.js routes might capture ".." as a segment.
    const res = await handleProxy(req, { params: { path: ["invoices", "..", "..", "internal"] } });
    expect(res.status).toBe(403);
  });

  it("injects the Bearer token but removes Host header", async () => {
    const req = new NextRequest("http://localhost:3000/api/proxy/invoices", {
      headers: new Headers({ "Host": "localhost:3000", "Custom-Header": "value" })
    });
    
    global.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    
    await handleProxy(req, { params: { path: ["invoices"] } });
    
    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const headers = fetchCall[1]?.headers as Headers;
    
    expect(headers.get("Authorization")).toBe("Bearer mock-jwt-token");
    expect(headers.has("host")).toBe(false);
    expect(headers.get("Custom-Header")).toBe("value");
  });
});
