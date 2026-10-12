import { describe, it, expect, vi, beforeEach } from "vitest";
import HomePage from "@/app/page";
import DashboardLayout from "@/app/(dashboard)/layout";
import { validateSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import React from "react";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  usePathname: vi.fn(() => "/dashboard"),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    validateSession: vi.fn(),
  };
});

// Mock DashboardShell client component
vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-shell">{children}</div>
  ),
}));

describe("Root Route and Dashboard Protection Redirect Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Root Route (/) HomePage", () => {
    it("redirects directly to /dashboard when user has a valid authenticated session", async () => {
      (validateSession as any).mockResolvedValue({
        id: "usr-1",
        organization_id: "org-1",
        email: "alice@company.com",
        full_name: "Alice Smith",
        is_active: true,
        role: "OWNER",
        created_at: "2026-01-01T00:00:00Z",
      });

      await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
      expect(redirect).toHaveBeenCalledWith("/dashboard");
    });

    it("redirects directly to /login when user is unauthenticated (no session)", async () => {
      (validateSession as any).mockResolvedValue(null);

      await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/login");
      expect(redirect).toHaveBeenCalledWith("/login");
    });

    it("redirects directly to /login when session is expired or invalid", async () => {
      (validateSession as any).mockResolvedValue(null);

      await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/login");
      expect(redirect).toHaveBeenCalledWith("/login");
    });
  });

  describe("Protected Dashboard Layout ((dashboard)/layout)", () => {
    it("redirects unauthenticated users to /login when accessing /dashboard", async () => {
      (validateSession as any).mockResolvedValue(null);
      (headers as any).mockResolvedValue({
        get: (key: string) => (key === "x-pathname" ? "/dashboard" : null),
      });

      await expect(
        DashboardLayout({ children: <div>Protected Content</div> })
      ).rejects.toThrow("NEXT_REDIRECT:/login");

      expect(redirect).toHaveBeenCalledWith("/login");
    });

    it("redirects unauthenticated users to /login?next=... preserving safe protected path", async () => {
      (validateSession as any).mockResolvedValue(null);
      (headers as any).mockResolvedValue({
        get: (key: string) => (key === "x-pathname" ? "/invoices/inv-123" : null),
      });

      await expect(
        DashboardLayout({ children: <div>Protected Content</div> })
      ).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Finvoices%2Finv-123");

      expect(redirect).toHaveBeenCalledWith("/login?next=%2Finvoices%2Finv-123");
    });

    it("sanitizes untrusted external URLs and redirects safely to /login", async () => {
      (validateSession as any).mockResolvedValue(null);
      (headers as any).mockResolvedValue({
        get: (key: string) =>
          key === "x-pathname" ? "https://evil.com/phishing" : null,
      });

      await expect(
        DashboardLayout({ children: <div>Protected Content</div> })
      ).rejects.toThrow("NEXT_REDIRECT:/login");

      expect(redirect).toHaveBeenCalledWith("/login");
    });

    it("sanitizes protocol-relative URLs (//evil.com) and redirects safely to /login", async () => {
      (validateSession as any).mockResolvedValue(null);
      (headers as any).mockResolvedValue({
        get: (key: string) => (key === "x-pathname" ? "//evil.com" : null),
      });

      await expect(
        DashboardLayout({ children: <div>Protected Content</div> })
      ).rejects.toThrow("NEXT_REDIRECT:/login");

      expect(redirect).toHaveBeenCalledWith("/login");
    });

    it("prevents redirect loops by not setting next param when pathname is / or /login", async () => {
      (validateSession as any).mockResolvedValue(null);
      (headers as any).mockResolvedValue({
        get: (key: string) => (key === "x-pathname" ? "/" : null),
      });

      await expect(
        DashboardLayout({ children: <div>Protected Content</div> })
      ).rejects.toThrow("NEXT_REDIRECT:/login");

      expect(redirect).toHaveBeenCalledWith("/login");
    });

    it("renders dashboard content when user has a valid authenticated session", async () => {
      (validateSession as any).mockResolvedValue({
        id: "usr-1",
        organization_id: "org-1",
        email: "alice@company.com",
        full_name: "Alice Smith",
        is_active: true,
        role: "OWNER",
        created_at: "2026-01-01T00:00:00Z",
      });

      const element = await DashboardLayout({
        children: <div data-testid="protected-child">Dashboard Page</div>,
      });

      expect(element).toBeDefined();
      expect(redirect).not.toHaveBeenCalled();
    });
  });
});
