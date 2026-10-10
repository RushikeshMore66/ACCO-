import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PaymentsPage from "@/app/(dashboard)/collections/payments/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { paymentsApi } from "@/lib/api/payments.api";
import { useDemoMode } from "@/providers/DemoModeProvider";

vi.mock("@/lib/api/payments.api", () => ({
  paymentsApi: {
    listPayments: vi.fn(),
  }
}));

vi.mock("@/providers/DemoModeProvider", () => ({
  useDemoMode: vi.fn(),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
});

describe("Phase 5: Payments & Reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads payments and displays formatting safely (Live API mode)", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([
      { 
        id: "pay-1", 
        reference: "REF-TEST-999", 
        customer_id: "cust-test", 
        amount: 1500.50, 
        currency: "INR", 
        payment_date: "2026-10-10", 
        payment_method: "BANK_TRANSFER",
        allocated_amount: 1000.00,
        unallocated_amount: 500.50,
        reversal: null,
        allocations: [],
      } as any
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    expect(screen.getByText("Live API")).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText("REF-TEST-999")).toBeInTheDocument();
    });

    // Check decimal formatting
    expect(screen.getAllByText(/1,500\.50/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/1,000\.00/)[0]).toBeInTheDocument();
    
    // Check partial badge
    expect(screen.getByText("PARTIAL")).toBeInTheDocument();
  });

  it("displays fully allocated badge correctly", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn() } as any);
    
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([
      { 
        id: "pay-2", 
        reference: "REF-FULL-111", 
        customer_id: "cust-test", 
        amount: 500, 
        currency: "USD", 
        payment_date: "2026-10-10", 
        payment_method: "CARD",
        allocated_amount: 500,
        unallocated_amount: 0,
        reversal: null,
        allocations: [],
      } as any
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    expect(screen.queryByText("Live API")).not.toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText("REF-FULL-111")).toBeInTheDocument();
      expect(screen.getByText("FULLY ALLOCATED")).toBeInTheDocument();
    });
  });
});
