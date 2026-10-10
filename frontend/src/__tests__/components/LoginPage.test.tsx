import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "@/app/(auth)/login/page";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn()
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: vi.fn()
}));

describe("LoginPage Redirects", () => {
  const mockPush = vi.fn();
  const mockRefresh = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
    (useAuth as any).mockReturnValue({ refresh: mockRefresh });
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    }) as any;
  });

  it("redirects to /dashboard by default after successful login", async () => {
    (useSearchParams as any).mockReturnValue({
      get: vi.fn().mockReturnValue(null)
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText(/you@company.com/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), { target: { value: "password123" } });
    
    fireEvent.click(screen.getAllByRole("button", { name: /sign in/i })[1]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("redirects to a safe valid next parameter", async () => {
    (useSearchParams as any).mockReturnValue({
      get: vi.fn().mockReturnValue("/customers/123")
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText(/you@company.com/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), { target: { value: "password123" } });
    
    fireEvent.click(screen.getAllByRole("button", { name: /sign in/i })[1]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/customers/123");
    });
  });

  it("ignores unsafe external next parameters and defaults to /dashboard", async () => {
    (useSearchParams as any).mockReturnValue({
      get: vi.fn().mockReturnValue("https://evil.com/phishing")
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText(/you@company.com/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), { target: { value: "password123" } });
    
    fireEvent.click(screen.getAllByRole("button", { name: /sign in/i })[1]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });
});
