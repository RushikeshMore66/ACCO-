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

  it("prevents redirect loops by defaulting to /dashboard when next is / or /login", async () => {
    (useSearchParams as any).mockReturnValue({
      get: vi.fn().mockReturnValue("/")
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

describe("LoginPage MFA and registration flows", () => {
  const mockPush = vi.fn();
  const mockRefresh = vi.fn().mockResolvedValue(undefined);

  function respondWith(body: object) {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as any;
  }

  function signIn() {
    (useSearchParams as any).mockReturnValue({ get: vi.fn().mockReturnValue(null) });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText(/you@company.com/i), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: "a-long-enough-passphrase" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /sign in/i })[1]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
    (useAuth as any).mockReturnValue({ refresh: mockRefresh });
  });

  it("routes to the MFA challenge page without refreshing the session", async () => {
    respondWith({ mfa_required: true });
    signIn();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/mfa/verify"));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("routes privileged users without MFA to mandatory enrolment", async () => {
    respondWith({ mfa_enrollment_required: true });
    signIn();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/mfa/setup"));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("rejects short passwords at sign-up (12 character minimum)", async () => {
    (useSearchParams as any).mockReturnValue({ get: vi.fn().mockReturnValue(null) });
    global.fetch = vi.fn() as any;
    render(<LoginPage />);
    fireEvent.click(screen.getAllByRole("button", { name: /sign up/i })[0]);
    fireEvent.change(screen.getByPlaceholderText(/jane doe/i), { target: { value: "Jane" } });
    fireEvent.change(screen.getByPlaceholderText(/you@company.com/i), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), { target: { value: "short1234" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText(/at least 12 characters/i)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
