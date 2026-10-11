import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PaymentsPage from "@/app/(dashboard)/collections/payments/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { paymentsApi } from "@/lib/api/payments.api";
import { customersApi } from "@/lib/api/customers.api";
import { invoicesApi } from "@/lib/api/invoices.api";
import { useDemoMode } from "@/providers/DemoModeProvider";

vi.mock("@/lib/api/payments.api", () => ({
  paymentsApi: {
    listPayments: vi.fn(),
    getPayment: vi.fn(),
    recordPayment: vi.fn(),
    allocatePayment: vi.fn(),
    reversePayment: vi.fn(),
  },
}));

vi.mock("@/lib/api/customers.api", () => ({
  customersApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("@/lib/api/invoices.api", () => ({
  invoicesApi: {
    list: vi.fn(),
    get: vi.fn(),
    getBalance: vi.fn(),
  },
}));

vi.mock("@/providers/DemoModeProvider", () => ({
  useDemoMode: vi.fn(),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

const mockCustomerList = [
  {
    id: "cust-1",
    name: "Acme Enterprises",
    email: "billing@acme.com",
    tax_identifier: "GSTIN-1122",
  },
  {
    id: "cust-2",
    name: "Globex Logistics",
    email: "ops@globex.com",
    tax_identifier: "GSTIN-3344",
  },
];

const mockPaymentsData = [
  {
    id: "pay-1",
    reference: "REF-TEST-999",
    customer_id: "cust-1",
    amount: 1500.50,
    currency: "INR",
    payment_date: "2026-10-10",
    payment_method: "BANK_TRANSFER",
    allocated_amount: 1000.00,
    unallocated_amount: 500.50,
    reversal: null,
    allocations: [
      {
        id: "alloc-1",
        payment_id: "pay-1",
        invoice_id: "inv-1",
        amount: 1000.00,
        created_at: "2026-10-10T10:00:00Z",
      },
    ],
  },
  {
    id: "pay-2",
    reference: "REF-FULL-111",
    customer_id: "cust-2",
    amount: 500.00,
    currency: "USD",
    payment_date: "2026-10-09",
    payment_method: "CARD",
    allocated_amount: 500.00,
    unallocated_amount: 0.00,
    reversal: null,
    allocations: [
      {
        id: "alloc-2",
        payment_id: "pay-2",
        invoice_id: "inv-2",
        amount: 500.00,
        created_at: "2026-10-09T14:30:00Z",
      },
    ],
  },
  {
    id: "pay-3",
    reference: "REF-FLOAT-777",
    customer_id: "cust-1",
    amount: 25000.00,
    currency: "INR",
    payment_date: "2026-10-08",
    payment_method: "ONLINE",
    allocated_amount: 0.00,
    unallocated_amount: 25000.00,
    reversal: null,
    allocations: [],
  },
  {
    id: "pay-4",
    reference: "REF-REV-000",
    customer_id: "cust-1",
    amount: 5000.00,
    currency: "INR",
    payment_date: "2026-10-05",
    payment_method: "CHEQUE",
    allocated_amount: 0.00,
    unallocated_amount: 5000.00,
    reversal: {
      id: "rev-1",
      reason: "Bank cheque bounced due to insufficient funds",
      reversed_at: "2026-10-06T11:00:00Z",
    },
    allocations: [],
  },
];

describe("Phase 5: Payments & Reconciliation Workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customersApi.list).mockResolvedValue(mockCustomerList as any);
  });

  it("loads payments and displays formatting safely (Live API mode)", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([mockPaymentsData[0]] as any);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    expect(screen.getByText("Live API")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("REF-TEST-999")).toBeInTheDocument();
    });

    // Check decimal formatting
    expect(screen.getAllByText(/1,500\.50/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/1,000/)[0]).toBeInTheDocument();

    // Check partial badge
    expect(screen.getByText("PARTIAL")).toBeInTheDocument();
  });

  it("displays fully allocated badge correctly", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([mockPaymentsData[1]] as any);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    expect(screen.queryByText("Live API")).not.toBeInTheDocument();
    expect(screen.getByText("Demo Mode")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("REF-FULL-111")).toBeInTheDocument();
      expect(screen.getByText("FULLY ALLOCATED")).toBeInTheDocument();
    });
  });

  it("displays canonical financial fields and resolves customer name links", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPaymentsData as any);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("REF-TEST-999")).toBeInTheDocument();
    });

    // Verify resolved customer names and links
    const customerLinks = await screen.findAllByRole("link", { name: /Acme Enterprises/i });
    expect(customerLinks.length).toBeGreaterThanOrEqual(1);
    expect(customerLinks[0]).toHaveAttribute("href", "/customers/cust-1");

    // Verify unallocated amount column exists
    expect(screen.getAllByText("Unallocated Float").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("REF-FLOAT-777")).toBeInTheDocument();
  });

  it("enforces accounting invariant banner distinguishing payments from debtor promises", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPaymentsData as any);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Only verified recorded payments and approved allocations adjust debtor balances/i)
      ).toBeInTheDocument();
    });
  });

  it("filters payments by status tabs (Unallocated, Partial, Fully Allocated, Reversed)", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPaymentsData as any);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("REF-TEST-999")).toBeInTheDocument();
    });

    // Filter by Reversed
    const reversedTab = screen.getByRole("button", { name: "Reversed" });
    fireEvent.click(reversedTab);

    expect(screen.getByText("REF-REV-000")).toBeInTheDocument();
    expect(screen.queryByText("REF-TEST-999")).not.toBeInTheDocument();
    expect(screen.queryByText("REF-FULL-111")).not.toBeInTheDocument();

    // Filter by Unallocated Float
    const unallocatedTab = screen.getByRole("button", { name: "Unallocated Float" });
    fireEvent.click(unallocatedTab);

    expect(screen.getByText("REF-FLOAT-777")).toBeInTheDocument();
    expect(screen.queryByText("REF-REV-000")).not.toBeInTheDocument();
  });

  it("opens payment details drawer and displays allocation history", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPaymentsData as any);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("REF-TEST-999")).toBeInTheDocument();
    });

    // Click row or View Details button for pay-1
    const row = screen.getByText("REF-TEST-999").closest("tr")!;
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText("Receipt Details")).toBeInTheDocument();
      expect(screen.getByText("Financial Balance Breakdown")).toBeInTheDocument();
      expect(screen.getByText("Allocated Invoices (1)")).toBeInTheDocument();
    });
  });

  it("opens allocation dialog, checks currency mismatch, and submits allocation", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([mockPaymentsData[2]] as any); // pay-3 (INR 25,000 unallocated)
    vi.mocked(invoicesApi.list).mockResolvedValue([
      {
        id: "inv-usd",
        invoice_number: "INV-USD-001",
        customer_id: "cust-1",
        currency: "USD",
        total_amount: 500,
        status: "ISSUED",
        due_date: "2026-10-20",
      },
      {
        id: "inv-inr",
        invoice_number: "INV-INR-002",
        customer_id: "cust-1",
        currency: "INR",
        total_amount: 20000,
        status: "ISSUED",
        due_date: "2026-10-25",
      },
    ] as any);
    vi.mocked(invoicesApi.getBalance).mockResolvedValue({
      invoice_id: "inv-inr",
      outstanding_amount: 15000,
      total_amount: 20000,
      paid_amount: 5000,
    } as any);
    vi.mocked(paymentsApi.allocatePayment).mockResolvedValue({
      ...mockPaymentsData[2],
      allocated_amount: 15000,
      unallocated_amount: 10000,
    } as any);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("REF-FLOAT-777")).toBeInTheDocument();
    });

    // Click Allocate action button
    const allocateBtn = screen.getByTitle("Allocate to Invoice");
    fireEvent.click(allocateBtn);

    await waitFor(() => {
      expect(screen.getByText("Allocate Payment to Invoice")).toBeInTheDocument();
      expect(screen.getByText("INV-USD-001")).toBeInTheDocument();
      expect(screen.getByText("INV-INR-002")).toBeInTheDocument();
    });

    // Select USD invoice -> expect currency mismatch warning
    fireEvent.click(screen.getByText("INV-USD-001"));
    expect(screen.getByText(/Cross-Currency Allocation Prohibited/i)).toBeInTheDocument();

    // Select INR invoice -> currency mismatch vanishes and amount input appears
    fireEvent.click(screen.getByText("INV-INR-002"));
    expect(screen.queryByText(/Cross-Currency Allocation Prohibited/i)).not.toBeInTheDocument();

    // Confirm allocation button
    const confirmBtn = screen.getByRole("button", { name: "Confirm Allocation" });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(paymentsApi.allocatePayment).toHaveBeenCalledWith(
        "pay-3",
        expect.objectContaining({
          invoice_id: "inv-inr",
          amount: expect.any(Number),
        })
      );
    });
  });

  it("opens payment recording dialog, validates fields, and records receipt", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([]);
    vi.mocked(paymentsApi.recordPayment).mockResolvedValue(mockPaymentsData[0] as any);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    const recordBtn = screen.getByRole("button", { name: /Record Payment/i });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(screen.getByText("Record Payment Receipt")).toBeInTheDocument();
      expect(screen.getByText(/Authoritative Financial Transaction:/i)).toBeInTheDocument();
    });

    // Submit button should be disabled initially (no customer or amount)
    const submitBtn = screen.getByRole("button", { name: "Record Payment" });
    expect(submitBtn).toBeDisabled();

    // Select customer
    const customerSelect = await screen.findByRole("combobox", { name: /Select Customer/i });
    await waitFor(() => expect(customerSelect).not.toBeDisabled());
    fireEvent.change(customerSelect, {
      target: { value: "cust-1" },
    });

    // Fill amount
    const amountInput = screen.getByPlaceholderText("0.00");
    fireEvent.change(amountInput, { target: { value: "1500.50" } });

    // Fill reference
    const refInput = screen.getByPlaceholderText(/e\.g\. UTR/i);
    fireEvent.change(refInput, { target: { value: "REF-TEST-999" } });

    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(paymentsApi.recordPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: "cust-1",
          amount: 1500.50,
          currency: "INR",
          reference: "REF-TEST-999",
        })
      );
    });
  });

  it("handles payment reversal workflow with confirmation and mandatory reason", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([mockPaymentsData[0]] as any);
    vi.mocked(paymentsApi.reversePayment).mockResolvedValue({
      ...mockPaymentsData[0],
      reversal: {
        id: "rev-new",
        reason: "Customer check bounced",
        reversed_at: "2026-10-11T12:00:00Z",
      },
    } as any);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("REF-TEST-999")).toBeInTheDocument();
    });

    // Click Reverse action button
    const reverseBtn = screen.getByTitle("Reverse Receipt");
    fireEvent.click(reverseBtn);

    await waitFor(() => {
      expect(screen.getByText("Reverse Payment Receipt")).toBeInTheDocument();
      expect(screen.getByText(/Irreversible Financial Impact:/i)).toBeInTheDocument();
    });

    const confirmReverseBtn = screen.getByRole("button", { name: "Confirm Reversal" });
    expect(confirmReverseBtn).toBeDisabled(); // reason is required

    // Enter reversal reason
    const reasonInput = screen.getByPlaceholderText(/Required: Provide the official reason/i);
    fireEvent.change(reasonInput, { target: { value: "Customer check bounced" } });

    expect(confirmReverseBtn).not.toBeDisabled();
    fireEvent.click(confirmReverseBtn);

    await waitFor(() => {
      expect(paymentsApi.reversePayment).toHaveBeenCalledWith("pay-1", {
        reason: "Customer check bounced",
      });
    });
  });

  it("does not offer reversal action for already-reversed receipts", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([mockPaymentsData[3]] as any); // pay-4 (already reversed)

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("REF-REV-000")).toBeInTheDocument();
      expect(screen.getByText("REVERSED")).toBeInTheDocument();
    });

    // Reverse action button should not exist for already reversed record
    expect(screen.queryByTitle("Reverse Receipt")).not.toBeInTheDocument();
  });

  it("displays error state without silent fallback when Live API call fails", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockRejectedValue(new Error("Database connection refused"));

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Error Loading Financial Payments")).toBeInTheDocument();
      expect(screen.getByText("Database connection refused")).toBeInTheDocument();
    });

    // Does NOT silently render mock items
    expect(screen.queryByText("REF-TEST-999")).not.toBeInTheDocument();
  });

  it("renders empty state when no payments match criteria", async () => {
    vi.mocked(useDemoMode).mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn() } as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([]);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("No payments found")).toBeInTheDocument();
    });
  });
});
