import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import InvoiceDetailPage from "@/app/(dashboard)/invoices/[invoiceId]/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoicesApi } from "@/lib/api/invoices.api";
import { customersApi } from "@/lib/api/customers.api";
import { paymentsApi } from "@/lib/api/payments.api";
import { collectionsApi } from "@/lib/api/collections.api";
import { communicationsApi } from "@/lib/api/communications.api";

vi.mock("@/lib/api/invoices.api", () => ({
  invoicesApi: {
    get: vi.fn(),
    getBalance: vi.fn(),
  },
}));

vi.mock("@/lib/api/customers.api", () => ({
  customersApi: {
    get: vi.fn(),
  },
}));

vi.mock("@/lib/api/payments.api", () => ({
  paymentsApi: {
    listPayments: vi.fn(),
  },
}));

vi.mock("@/lib/api/collections.api", () => ({
  collectionsApi: {
    getPromises: vi.fn(),
    getDisputes: vi.fn(),
  },
}));

vi.mock("@/lib/api/communications.api", () => ({
  communicationsApi: {
    getMessagesByInvoice: vi.fn(),
    getTimeline: vi.fn(),
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

let queryClient: QueryClient;

describe("Invoice Detail Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  const mockInvoice = {
    id: "inv-100",
    customer_id: "cust-1",
    invoice_number: "INV-2026-100",
    issue_date: "2026-09-01T00:00:00Z",
    due_date: "2026-09-15T00:00:00Z",
    currency: "INR",
    total_amount: "200000.00",
    description: "Annual Enterprise Cloud License",
    status: "ISSUED" as const,
    void_reason: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    voided_at: null,
  };

  const mockCustomer = {
    id: "cust-1",
    name: "Enterprise Solutions Ltd",
    contact_name: "Sarah Jenkins",
    email: "sarah@enterprise.example.com",
    phone: "+91 98765 43210",
    billing_address: "100 Tech Park, Bengaluru",
    tax_identifier: "GSTIN-29AAACE1234F1Z5",
    is_active: true,
  };

  const mockBalance = {
    invoice_id: "inv-100",
    customer_id: "cust-1",
    invoice_number: "INV-2026-100",
    currency: "INR",
    total_amount: "200000.00",
    paid_amount: "50000.00",
    outstanding_amount: "150000.00",
    days_overdue: 26,
    payment_status: "PARTIALLY_PAID" as const,
    aging_bucket: "1_30" as const,
  };

  const mockPayments = [
    {
      id: "pay-1",
      customer_id: "cust-1",
      amount: 50000,
      currency: "INR",
      payment_date: "2026-09-20",
      payment_method: "BANK_TRANSFER",
      reference: "UTR-8829103",
      notes: "First installment settled",
      reversal: null,
      allocations: [
        {
          id: "alloc-1",
          payment_id: "pay-1",
          invoice_id: "inv-100",
          amount: 50000,
          created_at: "2026-09-20T10:00:00Z",
        },
      ],
    },
    {
      id: "pay-2",
      customer_id: "cust-1",
      amount: 25000,
      currency: "INR",
      payment_date: "2026-09-22",
      payment_method: "CHEQUE",
      reference: "CHQ-001928",
      notes: "Bounced cheque - reversed",
      reversal: {
        id: "rev-1",
        reason: "Cheque bounced due to insufficient funds",
        reversed_at: "2026-09-23T14:30:00Z",
      },
      allocations: [
        {
          id: "alloc-2",
          payment_id: "pay-2",
          invoice_id: "inv-100",
          amount: 25000,
          created_at: "2026-09-22T12:00:00Z",
        },
      ],
    },
  ];

  const mockPromises = [
    {
      id: "prom-1",
      invoice_id: "inv-100",
      promised_amount: "75000.00",
      currency: "INR",
      expected_payment_date: "2026-10-20",
      follow_up_date: "2026-10-21",
      status: "ACTIVE" as const,
      notes: "Promised via CFO confirmation call",
      created_at: "2026-09-28T09:00:00Z",
      updated_at: "2026-09-28T09:00:00Z",
    },
  ];

  const mockDisputes = [
    {
      id: "disp-1",
      invoice_id: "inv-100",
      category: "WRONG_AMOUNT" as const,
      description: "Customer disputes licensing seat count discrepancy",
      status: "UNDER_REVIEW" as const,
      resolution_notes: null,
      created_at: "2026-09-18T11:00:00Z",
      updated_at: "2026-09-19T10:00:00Z",
      resolved_at: null,
    },
  ];

  const mockMessages = [
    {
      id: "msg-1",
      invoice_id: "inv-100",
      direction: "INBOUND" as const,
      channel: "EMAIL" as const,
      status: "RECEIVED" as const,
      subject: "Re: Invoice INV-2026-100 Payment Schedule",
      body: "We will process the remaining balance in two tranches next month.",
      sent_at: "2026-09-27T16:00:00Z",
      created_at: "2026-09-27T16:00:00Z",
    },
  ];

  const mockTimeline = [
    {
      event_type: "PAYMENT_ALLOCATED",
      description: "Allocated ₹50,000 from Payment UTR-8829103",
      created_at: "2026-09-20T10:00:00Z",
    },
    {
      event_type: "INVOICE_ISSUED",
      description: "Invoice INV-2026-100 issued to Enterprise Solutions Ltd",
      created_at: "2026-09-01T00:00:00Z",
    },
  ];

  it("renders invoice identity, customer info, and authoritative financial summaries", async () => {
    vi.mocked(invoicesApi.get).mockResolvedValue(mockInvoice as any);
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomer as any);
    vi.mocked(invoicesApi.getBalance).mockResolvedValue(mockBalance as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPayments as any);
    vi.mocked(collectionsApi.getPromises).mockResolvedValue(mockPromises as any);
    vi.mocked(collectionsApi.getDisputes).mockResolvedValue(mockDisputes as any);
    vi.mocked(communicationsApi.getMessagesByInvoice).mockResolvedValue(mockMessages as any);
    vi.mocked(communicationsApi.getTimeline).mockResolvedValue(mockTimeline as any);

    render(
      <QueryClientProvider client={queryClient}>
        <InvoiceDetailPage params={{ invoiceId: "inv-100" }} />
      </QueryClientProvider>
    );

    // Verify invoice number and customer link
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "INV-2026-100" })).toBeInTheDocument();
      expect(
        screen.getAllByRole("link", { name: "Enterprise Solutions Ltd" }).length
      ).toBeGreaterThanOrEqual(1);
    });

    const customerLinks = screen.getAllByRole("link", { name: "Enterprise Solutions Ltd" });
    expect(customerLinks[0]).toHaveAttribute("href", "/customers/cust-1");

    // Authoritative financial totals
    expect(screen.getByText("₹2,00,000")).toBeInTheDocument(); // Total amount
    expect(screen.getByText("₹50,000")).toBeInTheDocument(); // Paid amount
    expect(screen.getByText("₹1,50,000")).toBeInTheDocument(); // Outstanding balance
  });

  it("distinguishes valid allocations from reversed payments in the Payments tab", async () => {
    vi.mocked(invoicesApi.get).mockResolvedValue(mockInvoice as any);
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomer as any);
    vi.mocked(invoicesApi.getBalance).mockResolvedValue(mockBalance as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPayments as any);
    vi.mocked(collectionsApi.getPromises).mockResolvedValue(mockPromises as any);
    vi.mocked(collectionsApi.getDisputes).mockResolvedValue(mockDisputes as any);
    vi.mocked(communicationsApi.getMessagesByInvoice).mockResolvedValue(mockMessages as any);
    vi.mocked(communicationsApi.getTimeline).mockResolvedValue(mockTimeline as any);

    render(
      <QueryClientProvider client={queryClient}>
        <InvoiceDetailPage params={{ invoiceId: "inv-100" }} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Payments/i })).toBeInTheDocument();
    });

    // Switch to Payments tab
    fireEvent.click(screen.getByRole("tab", { name: /Payments/i }));

    await waitFor(() => {
      expect(screen.getByText("UTR-8829103")).toBeInTheDocument();
      expect(screen.getByText("CHQ-001928")).toBeInTheDocument();
    });

    // Valid allocation shows Active status
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);

    // Bounced cheque shows Reversed status with reason
    expect(screen.getByText("Reversed")).toBeInTheDocument();
    expect(screen.getByText(/Cheque bounced due to insufficient funds/)).toBeInTheDocument();
  });

  it("verifies financial invariant: payment promises do not reduce outstanding balance", async () => {
    vi.mocked(invoicesApi.get).mockResolvedValue(mockInvoice as any);
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomer as any);
    vi.mocked(invoicesApi.getBalance).mockResolvedValue(mockBalance as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPayments as any);
    vi.mocked(collectionsApi.getPromises).mockResolvedValue(mockPromises as any);
    vi.mocked(collectionsApi.getDisputes).mockResolvedValue(mockDisputes as any);
    vi.mocked(communicationsApi.getMessagesByInvoice).mockResolvedValue(mockMessages as any);
    vi.mocked(communicationsApi.getTimeline).mockResolvedValue(mockTimeline as any);

    render(
      <QueryClientProvider client={queryClient}>
        <InvoiceDetailPage params={{ invoiceId: "inv-100" }} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Promises/i })).toBeInTheDocument();
      // Outstanding balance remains ₹1,50,000 despite ₹75,000 promise
      expect(screen.getByText("₹1,50,000")).toBeInTheDocument();
    });

    // Switch to Promises tab
    fireEvent.click(screen.getByRole("tab", { name: /Promises/i }));

    await waitFor(() => {
      expect(screen.getAllByText("₹75,000").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Promise Tracking Rule/i)).toBeInTheDocument();
      expect(
        screen.getByText(/promises do not deduct from outstanding balance/i)
      ).toBeInTheDocument();
    });
  });

  it("displays disputes and activity timeline in their dedicated tabs", async () => {
    vi.mocked(invoicesApi.get).mockResolvedValue(mockInvoice as any);
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomer as any);
    vi.mocked(invoicesApi.getBalance).mockResolvedValue(mockBalance as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPayments as any);
    vi.mocked(collectionsApi.getPromises).mockResolvedValue(mockPromises as any);
    vi.mocked(collectionsApi.getDisputes).mockResolvedValue(mockDisputes as any);
    vi.mocked(communicationsApi.getMessagesByInvoice).mockResolvedValue(mockMessages as any);
    vi.mocked(communicationsApi.getTimeline).mockResolvedValue(mockTimeline as any);

    render(
      <QueryClientProvider client={queryClient}>
        <InvoiceDetailPage params={{ invoiceId: "inv-100" }} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Disputes/i })).toBeInTheDocument();
    });

    // Check Disputes tab
    fireEvent.click(screen.getByRole("tab", { name: /Disputes/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/WRONG AMOUNT/i).length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText(/Customer disputes licensing seat count discrepancy/i).length
      ).toBeGreaterThanOrEqual(1);
    });

    // Check Activity & History tab
    fireEvent.click(screen.getByRole("tab", { name: /Activity/i }));

    await waitFor(() => {
      expect(screen.getByText("Collection Messages")).toBeInTheDocument();
      expect(
        screen.getByText("Re: Invoice INV-2026-100 Payment Schedule")
      ).toBeInTheDocument();
      expect(screen.getByText("Audit & Activity Timeline")).toBeInTheDocument();
      expect(
        screen.getByText("Allocated ₹50,000 from Payment UTR-8829103")
      ).toBeInTheDocument();
    });
  });

  it("handles 404 not found state gracefully with navigation back", async () => {
    vi.mocked(invoicesApi.get).mockRejectedValue({ status: 404, message: "Not found" });

    render(
      <QueryClientProvider client={queryClient}>
        <InvoiceDetailPage params={{ invoiceId: "inv-missing" }} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Invoice Not Found")).toBeInTheDocument();
    });

    expect(screen.getByText("Back to Invoice Directory")).toBeInTheDocument();
  });
});
