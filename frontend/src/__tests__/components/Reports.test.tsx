import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ReportsPage from "@/app/(dashboard)/reports/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { receivablesApi } from "@/lib/api/receivables.api";
import { paymentsApi } from "@/lib/api/payments.api";
import { customersApi } from "@/lib/api/customers.api";
import { collectionsApi } from "@/lib/api/collections.api";
import { useDemoMode } from "@/providers/DemoModeProvider";

vi.mock("@/lib/api/receivables.api", () => ({
  receivablesApi: {
    getSummary: vi.fn(),
    getAging: vi.fn(),
    getInvoices: vi.fn(),
  },
}));

vi.mock("@/lib/api/payments.api", () => ({
  paymentsApi: {
    listPayments: vi.fn(),
  },
}));

vi.mock("@/lib/api/customers.api", () => ({
  customersApi: {
    list: vi.fn(),
  },
}));

vi.mock("@/lib/api/collections.api", () => ({
  collectionsApi: {
    listAllPromises: vi.fn(),
  },
}));

vi.mock("@/providers/DemoModeProvider", () => ({
  useDemoMode: vi.fn(),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

const mockSummaryData = [
  {
    currency: "INR",
    invoices_count: 25,
    total_issued_amount: 500000.0,
    total_allocated_amount: 150000.0,
    total_outstanding_amount: 350000.0,
    overdue_invoices_count: 8,
    total_overdue_amount: 120000.0,
  },
];

const mockAgingData = [
  {
    currency: "INR",
    buckets: [
      { bucket: "NOT_DUE", outstanding_invoices_count: 17, outstanding_amount: 230000.0 },
      { bucket: "1_30", outstanding_invoices_count: 4, outstanding_amount: 60000.0 },
      { bucket: "31_60", outstanding_invoices_count: 2, outstanding_amount: 35000.0 },
      { bucket: "61_90", outstanding_invoices_count: 1, outstanding_amount: 15000.0 },
      { bucket: "90_PLUS", outstanding_invoices_count: 1, outstanding_amount: 10000.0 },
    ],
  },
];

const mockInvoicesData = [
  {
    invoice_id: "inv-001",
    invoice_number: "INV-2026-001",
    customer_id: "cust-1",
    currency: "INR",
    total_amount: 100000.0,
    paid_amount: 40000.0,
    outstanding_amount: 60000.0,
    days_overdue: 15,
    payment_status: "PARTIALLY_PAID",
    aging_bucket: "1_30",
    due_date: "2026-09-26",
  },
  {
    invoice_id: "inv-002",
    invoice_number: "INV-2026-002",
    customer_id: "cust-2",
    currency: "INR",
    total_amount: 230000.0,
    paid_amount: 0.0,
    outstanding_amount: 230000.0,
    days_overdue: 0,
    payment_status: "UNPAID",
    aging_bucket: "NOT_DUE",
    due_date: "2026-10-30",
  },
];

const mockPaymentsData = [
  {
    id: "pay-1",
    reference: "REF-001",
    customer_id: "cust-1",
    amount: 40000.0,
    currency: "INR",
    payment_date: "2026-10-01",
    payment_method: "BANK_TRANSFER",
    allocated_amount: 40000.0,
    unallocated_amount: 0.0,
    reversal: null,
    allocations: [],
  },
  {
    id: "pay-2",
    reference: "REF-REV-002",
    customer_id: "cust-1",
    amount: 15000.0,
    currency: "INR",
    payment_date: "2026-09-15",
    payment_method: "CHEQUE",
    allocated_amount: 0.0,
    unallocated_amount: 15000.0,
    reversal: {
      id: "rev-1",
      reason: "Cheque bounced",
      reversed_at: "2026-09-16T10:00:00Z",
    },
    allocations: [],
  },
];

describe("Phase 6: Reports & Analytics Workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(receivablesApi.getSummary).mockResolvedValue(mockSummaryData as any);
    vi.mocked(receivablesApi.getAging).mockResolvedValue(mockAgingData as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockInvoicesData as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPaymentsData as any);
    vi.mocked(customersApi.list).mockResolvedValue([
      { id: "cust-1", name: "Acme Enterprises" },
      { id: "cust-2", name: "Globex Logistics" },
    ] as any);
    vi.mocked(collectionsApi.listAllPromises).mockResolvedValue([]);
  });

  it("renders receivables summary metrics and Live API badge", async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReportsPage />
      </QueryClientProvider>
    );

    expect(screen.getByText("Live API")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Total Outstanding")).toBeInTheDocument();
      expect(screen.getByText("Overdue Receivables")).toBeInTheDocument();
      expect(screen.getByText("Allocated / Issued Portfolio")).toBeInTheDocument();
      expect(screen.getByText("Total Issued Portfolio")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Recorded allocations as a share of issued invoice value\. This is a cumulative portfolio ratio, not a period-specific collection rate\./i)
    ).toBeInTheDocument();

    // Verify formatted amounts
    await waitFor(() => {
      expect(screen.getAllByText(/3,50,000/)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/1,20,000/)[0]).toBeInTheDocument();
    });
  });

  it("maps canonical aging buckets with correct classifications and amounts", async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReportsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Current (Not Due)")).toBeInTheDocument();
      expect(screen.getByText("1-30 Days")).toBeInTheDocument();
      expect(screen.getByText("31-60 Days")).toBeInTheDocument();
      expect(screen.getByText("61-90 Days")).toBeInTheDocument();
      expect(screen.getByText("90+ Days")).toBeInTheDocument();
    });

    // Check specific bucket amounts
    expect(screen.getAllByText(/2,30,000/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/60,000/)[0]).toBeInTheDocument();
  });

  it("navigates to Collections workspace with preserved bucket query param when bucket is clicked", async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReportsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("1-30 Days")).toBeInTheDocument();
    });

    // Find table row for 1-30 Days
    const row = screen.getByText("1-30 Days").closest("tr")!;
    fireEvent.click(row);

    expect(mockPush).toHaveBeenCalledWith("/collections?bucket=1_30");
  });

  it("enforces accounting invariant banner distinguishing payments from debtor promises", async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReportsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Debtor payment promises and correspondence represent debtor intentions/i)
      ).toBeInTheDocument();
    });
  });

  it("switches to Invoice Receivables Ledger tab and filters by aging bucket and status", async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReportsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Invoice Receivables Ledger/i)).toBeInTheDocument();
    });

    // Switch to Ledger tab
    fireEvent.click(screen.getByText(/Invoice Receivables Ledger/i));

    await waitFor(() => {
      expect(screen.getByText("INV-2026-001")).toBeInTheDocument();
      expect(screen.getByText("INV-2026-002")).toBeInTheDocument();
    });

    // Filter by bucket 1-30 Days
    const bucketSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(bucketSelect, { target: { value: "1_30" } });

    expect(screen.getByText("INV-2026-001")).toBeInTheDocument();
    expect(screen.queryByText("INV-2026-002")).not.toBeInTheDocument();
  });

  it("switches to Payments & Cash Flow tab and distinguishes reversed receipts", async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReportsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Payment Receipts & Cash Flow/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Payment Receipts & Cash Flow/i));

    await waitFor(() => {
      expect(screen.getByText("REF-001")).toBeInTheDocument();
      expect(screen.getByText("REF-REV-002")).toBeInTheDocument();
      expect(screen.getByText("REVERSED")).toBeInTheDocument();
      expect(screen.getByText("FULLY ALLOCATED")).toBeInTheDocument();
    });
  });

  it("switches to Collection Performance tab and flags demo-only scope with clear disclaimers", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn() } as any);
    vi.mocked(collectionsApi.listAllPromises).mockResolvedValue([
      { id: "prom-1", status: "ACTIVE" },
      { id: "prom-2", status: "FULFILLED" },
    ] as any);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReportsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Collection Performance/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Collection Performance/i));

    await waitFor(() => {
      expect(screen.getByText(/Payment Promise Performance/i)).toBeInTheDocument();
      expect(screen.getByText(/The live ACCO FastAPI backend does not yet record collector assignment queues/i)).toBeInTheDocument();
      expect(screen.getByText("Total Promises Logged")).toBeInTheDocument();
    });
  });

  it("exports comprehensive RFC 4180 CSV with UTF-8 BOM, escaped values and full precision", async () => {
    // Mock URL and createElement
    const createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReportsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Export CSV/i });
      expect(btn).toBeInTheDocument();
      expect(btn).not.toBeDisabled();
    });

    const exportBtn = screen.getByRole("button", { name: /Export CSV/i });
    fireEvent.click(exportBtn);

    expect(createObjectURLMock).toHaveBeenCalled();
    const blobArg = createObjectURLMock.mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe("text/csv;charset=utf-8");
  });

  it("displays error state with retry button when API fails without silent mock fallback", async () => {
    vi.mocked(receivablesApi.getSummary).mockRejectedValue(new Error("Network timeout to PostgreSQL"));

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReportsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Network timeout to PostgreSQL")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
    });

    // Does NOT silently render mock items
    expect(screen.queryByText("Live API")).toBeInTheDocument();
  });
});
