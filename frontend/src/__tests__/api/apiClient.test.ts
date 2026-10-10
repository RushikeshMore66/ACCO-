import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError, isApiError } from "@/lib/api/errors";
import { apiClient } from "@/lib/api/client";

// Mock the global fetch
const originalFetch = global.fetch;

describe("apiClient", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("routes through /api/proxy and attaches credentials", async () => {
    const mockResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

    await apiClient("/test-endpoint");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/proxy/test-endpoint"),
      expect.objectContaining({
        credentials: "include",
      })
    );
  });

  it("throws ApiError with status 0 on network failure", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(apiClient("/test")).rejects.toMatchObject({
      status: 0,
      isNetworkError: true,
    });
  });

  it("throws ApiError with 401 on authentication failure", async () => {
    const mockResponse = new Response(JSON.stringify({ detail: "Not authenticated" }), { status: 401 });
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

    await expect(apiClient("/test")).rejects.toMatchObject({
      status: 401,
      isAuthError: true,
    });
  });

  it("parses JSON error detail from backend", async () => {
    const mockResponse = new Response(JSON.stringify({ detail: "Invalid input" }), { status: 422 });
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

    await expect(apiClient("/test")).rejects.toMatchObject({
      status: 422,
      message: "Invalid input",
      isValidationError: true,
    });
  });

  it("handles non-JSON error responses", async () => {
    const mockResponse = new Response("Internal Server Error", { status: 500, statusText: "Server Error" });
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

    await expect(apiClient("/test")).rejects.toMatchObject({
      status: 500,
      message: "HTTP 500: Server Error",
      isServerError: true,
    });
  });

  it("handles 204 No Content success correctly", async () => {
    const mockResponse = new Response(null, { status: 204 });
    vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

    const result = await apiClient("/test");
    expect(result).toBeUndefined();
  });
});
