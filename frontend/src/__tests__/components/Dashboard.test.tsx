import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api/client", () => ({
  isDemoMode: true,
  apiClient: vi.fn(),
}));

vi.mock("@/lib/api/receivables.api", () => ({
  receivablesApi: {
    getSummary: vi.fn().mockResolvedValue([{
      currency: "INR",
      invoices_count: 50,
      total_issued_amount: 500000,
      total_allocated_amount: 150000,
      total_outstanding_amount: 350000,
      overdue_invoices_count: 10,
      total_overdue_amount: 75000,
    }]),
    getAging: vi.fn().mockResolvedValue([{
      currency: "INR",
      buckets: [
        { bucket: "NOT_DUE", outstanding_invoices_count: 40, outstanding_amount: 275000 },
        { bucket: "1_30", outstanding_invoices_count: 5, outstanding_amount: 25000 },
        { bucket: "31_60", outstanding_invoices_count: 3, outstanding_amount: 30000 },
        { bucket: "61_90", outstanding_invoices_count: 1, outstanding_amount: 10000 },
        { bucket: "90_PLUS", outstanding_invoices_count: 1, outstanding_amount: 10000 }
      ]
    }]),
    getInvoices: vi.fn().mockResolvedValue([
      { invoice_id: "inv-1", invoice_number: "INV-001", currency: "INR", outstanding_amount: 25000, days_overdue: 15, payment_status: "UNPAID" },
      { invoice_id: "inv-2", invoice_number: "INV-002", currency: "INR", outstanding_amount: 10000, days_overdue: 95, payment_status: "UNPAID" }
    ])
  }
}));

vi.mock("@/lib/api/collections.api", () => ({
  collectionsApi: {
    listAllPromises: vi.fn().mockResolvedValue([])
  }
}));

vi.mock("@/lib/api/communications.api", () => ({
  communicationsApi: {
    listAllAnalyses: vi.fn().mockResolvedValue([])
  }
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const queryClient = new QueryClient();

describe("DashboardPage", () => {
  it("renders KPI values correctly with currency formatting", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    );

    // Wait for the queries to resolve and the UI to update
    const totalOutstanding = await screen.findByText("₹3,50,000");
    expect(totalOutstanding).toBeInTheDocument();

    const overdueAmount = await screen.findByText("₹75,000");
    expect(overdueAmount).toBeInTheDocument();

    const overdueCount = await screen.findByText("10");
    expect(overdueCount).toBeInTheDocument();
  });

  it("renders priority work queue items", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    );

    const highPriorityInv = await screen.findByText("Invoice INV-002");
    expect(highPriorityInv).toBeInTheDocument();

    const mediumPriorityInv = await screen.findByText("Invoice INV-001");
    expect(mediumPriorityInv).toBeInTheDocument();
  });
});
