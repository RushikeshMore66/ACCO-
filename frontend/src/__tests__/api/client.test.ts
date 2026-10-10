import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, isApiError } from "@/lib/api/errors";

describe("ApiError", () => {
  it("sets message and status correctly", () => {
    const err = new ApiError(404, "Not found", { detail: "Not found" });
    expect(err.message).toBe("Not found");
    expect(err.status).toBe(404);
    expect(err.name).toBe("ApiError");
  });

  it("isNotFound returns true for 404", () => {
    expect(new ApiError(404, "Not found").isNotFound).toBe(true);
    expect(new ApiError(200, "ok").isNotFound).toBe(false);
  });

  it("isAuthError returns true for 401 and 403", () => {
    expect(new ApiError(401, "Unauthorized").isAuthError).toBe(true);
    expect(new ApiError(403, "Forbidden").isAuthError).toBe(true);
    expect(new ApiError(200, "ok").isAuthError).toBe(false);
  });

  it("isNetworkError returns true for status 0", () => {
    expect(new ApiError(0, "Network error").isNetworkError).toBe(true);
    expect(new ApiError(500, "Server error").isNetworkError).toBe(false);
  });

  it("isConflict returns true for 409", () => {
    expect(new ApiError(409, "Conflict").isConflict).toBe(true);
  });

  it("isValidationError returns true for 422", () => {
    expect(new ApiError(422, "Validation error").isValidationError).toBe(true);
  });

  it("isServerError returns true for 5xx", () => {
    expect(new ApiError(500, "Server error").isServerError).toBe(true);
    expect(new ApiError(503, "Service unavailable").isServerError).toBe(true);
    expect(new ApiError(404, "Not found").isServerError).toBe(false);
  });
});

describe("isApiError", () => {
  it("returns true for ApiError instances", () => {
    expect(isApiError(new ApiError(400, "Bad request"))).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isApiError(new Error("plain error"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isApiError(null)).toBe(false);
  });
});
