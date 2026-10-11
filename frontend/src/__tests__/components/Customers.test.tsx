import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import CustomersDirectoryPage from "@/app/(dashboard)/customers/page";
import CustomerDetailPage from "@/app/(dashboard)/customers/[customerId]/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers.api";
import { receivablesApi } from "@/lib/api/receivables.api";
import { paymentsApi } from "@/lib/api/payments.api";
import { collectionsApi } from "@/lib/api/collections.api";
import { communicationsApi } from "@/lib/api/communications.api";
import { useDemoMode } from "@/providers/DemoModeProvider";

vi.mock("@/lib/api/customers.api", () => ({
  customersApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/api/receivables.api", () => ({
  receivablesApi: {
    getInvoices: vi.fn(),
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

vi.mock("@/providers/DemoModeProvider", () => ({
  useDemoMode: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className, onClick }: any) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

let queryClient: QueryClient;

describe("Customer Management & Directory Workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    vi.mocked(useDemoMode).mockReturnValue({
      isDemoMode: false,
      setDemoMode: vi.fn(),
    });
  });

  const mockCustomers = [
    {
      id: "cust-1",
      organization_id: "org-1",
      name: "Acme Industrial Corp",
      contact_name: "Alice Smith",
      email: "alice@acme.com",
      phone: "+91 98765 43210",
      billing_address: "123 Industrial Way, Mumbai",
      tax_identifier: "27AAACA1234A1Z5",
      is_active: true,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "cust-2",
      organization_id: "org-1",
      name: "Beta Logistics Ltd",
      contact_name: "Bob Jones",
      email: "bob@betalogistics.com",
      phone: "+91 91234 56789",
      billing_address: "456 Port Road, Chennai",
      tax_identifier: "33AAACB5678B1Z2",
      is_active: false,
      created_at: "2026-08-15T00:00:00Z",
      updated_at: "2026-08-15T00:00:00Z",
    },
  ];

  it("renders customer directory with columns, customer data, and Live API badge", async () => {
    vi.mocked(customersApi.list).mockResolvedValue(mockCustomers as any);

    render(
      <QueryClientProvider client={queryClient}>
        <CustomersDirectoryPage />
      </QueryClientProvider>
    );

    expect(screen.getByText("Customer Directory")).toBeInTheDocument();
    expect(screen.getByText("Live API")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial Corp")).toBeInTheDocument();
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("27AAACA1234A1Z5")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    // Check directory table headers
    expect(screen.getByText("Customer / Company")).toBeInTheDocument();
    expect(screen.getByText("Contact Person")).toBeInTheDocument();
    expect(screen.getByText("Tax Identifier")).toBeInTheDocument();
  });

  it("filters customers by search query", async () => {
    vi.mocked(customersApi.list).mockResolvedValue(mockCustomers as any);

    render(
      <QueryClientProvider client={queryClient}>
        <CustomersDirectoryPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial Corp")).toBeInTheDocument();
      expect(screen.getByText("Beta Logistics Ltd")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(
      "Search by customer name, email, or tax ID…"
    );
    fireEvent.change(searchInput, { target: { value: "alice@acme" } });

    expect(screen.getByText("Acme Industrial Corp")).toBeInTheDocument();
    expect(screen.queryByText("Beta Logistics Ltd")).not.toBeInTheDocument();
  });

  it("opens create customer modal, validates input, and submits successfully", async () => {
    vi.mocked(customersApi.list).mockResolvedValue(mockCustomers as any);
    const createdCustomer = {
      id: "cust-3",
      organization_id: "org-1",
      name: "Delta Innovations",
      contact_name: "Diana Prince",
      email: "diana@delta.com",
      phone: "+91 99887 76655",
      billing_address: "789 Tech Park, Bengaluru",
      tax_identifier: "29AAACD9876D1Z4",
      is_active: true,
      created_at: "2026-10-11T00:00:00Z",
      updated_at: "2026-10-11T00:00:00Z",
    };
    vi.mocked(customersApi.create).mockResolvedValue(createdCustomer as any);

    render(
      <QueryClientProvider client={queryClient}>
        <CustomersDirectoryPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("New Customer")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Customer"));

    expect(screen.getByText("Create New Customer")).toBeInTheDocument();

    // Trigger validation with empty name
    const form = screen.getByRole("dialog").querySelector("form")!;
    const submitBtn = screen.getByRole("button", { name: "Create Customer" });
    fireEvent.submit(form);

    expect(screen.getByText("Customer name is required.")).toBeInTheDocument();
    expect(customersApi.create).not.toHaveBeenCalled();

    // Fill valid data
    const nameInput = screen.getByLabelText(/Customer \/ Company Name/i);
    fireEvent.change(nameInput, { target: { value: "Delta Innovations" } });

    const contactInput = screen.getByLabelText(/Contact Person/i);
    fireEvent.change(contactInput, { target: { value: "Diana Prince" } });

    const emailInput = screen.getByLabelText(/Email Address/i);
    fireEvent.change(emailInput, { target: { value: "diana@delta.com" } });

    fireEvent.submit(form);

    await waitFor(() => {
      expect(customersApi.create).toHaveBeenCalledWith({
        name: "Delta Innovations",
        contact_name: "Diana Prince",
        email: "diana@delta.com",
        phone: null,
        tax_identifier: null,
        billing_address: null,
      });
    });
  });

  it("handles directory loading failure with retry option", async () => {
    vi.mocked(customersApi.list).mockRejectedValue(
      new Error("Database connection failure")
    );

    render(
      <QueryClientProvider client={queryClient}>
        <CustomersDirectoryPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to load customers")).toBeInTheDocument();
      expect(screen.getByText("Database connection failure")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });
  });
});

describe("Customer Detail Workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    vi.mocked(useDemoMode).mockReturnValue({
      isDemoMode: false,
      setDemoMode: vi.fn(),
    });
  });

  const mockCustomer = {
    id: "cust-1",
    organization_id: "org-1",
    name: "Acme Industrial Corp",
    contact_name: "Alice Smith",
    email: "alice@acme.com",
    phone: "+91 98765 43210",
    billing_address: "123 Industrial Way, Mumbai",
    tax_identifier: "27AAACA1234A1Z5",
    is_active: true,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  const mockInvoices = [
    {
      invoice_id: "inv-101",
      customer_id: "cust-1",
      invoice_number: "INV-2026-101",
      currency: "INR",
      total_amount: 150000,
      paid_amount: 50000,
      outstanding_amount: 100000,
      days_overdue: 15,
      payment_status: "PARTIALLY_PAID" as const,
      aging_bucket: "1_30" as const,
      issue_date: "2026-08-01",
      due_date: "2026-08-15",
    },
    {
      invoice_id: "inv-102",
      customer_id: "cust-1",
      invoice_number: "INV-2026-102",
      currency: "INR",
      total_amount: 50000,
      paid_amount: 0,
      outstanding_amount: 50000,
      days_overdue: 0,
      payment_status: "UNPAID" as const,
      aging_bucket: "NOT_DUE" as const,
      issue_date: "2026-09-01",
      due_date: "2026-10-15",
    },
  ];

  const mockPayments = [
    {
      id: "pay-1",
      organization_id: "org-1",
      customer_id: "cust-1",
      amount: 50000,
      currency: "INR",
      payment_date: "2026-08-20",
      payment_method: "BANK_TRANSFER" as const,
      reference: "HDFC-TXN-9988",
      notes: "Wire remittance",
      created_at: "2026-08-20T10:00:00Z",
      allocated_amount: 50000,
      unallocated_amount: 0,
      allocations: [
        {
          id: "alloc-1",
          payment_id: "pay-1",
          invoice_id: "inv-101",
          amount: 50000,
          created_at: "2026-08-20T10:05:00Z",
        },
      ],
      reversal: null,
    },
    {
      id: "pay-2",
      organization_id: "org-1",
      customer_id: "cust-1",
      amount: 25000,
      currency: "INR",
      payment_date: "2026-09-10",
      payment_method: "CHEQUE" as const,
      reference: "CHQ-12345",
      notes: "Deposit bounced later",
      created_at: "2026-09-10T10:00:00Z",
      allocated_amount: 0,
      unallocated_amount: 0,
      allocations: [],
      reversal: {
        id: "rev-1",
        reason: "Cheque dishonoured by drawer",
        reversed_at: "2026-09-12T10:00:00Z",
      },
    },
  ];

  const mockPromises = [
    {
      id: "prom-1",
      invoice_id: "inv-101",
      promised_amount: 100000,
      expected_payment_date: "2026-10-25",
      status: "ACTIVE" as const,
      notes: "Promised wire transfer on next payroll run",
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  ];

  const mockDisputes = [
    {
      id: "disp-1",
      invoice_id: "inv-102",
      category: "WRONG_AMOUNT" as const,
      description: "Billing discount of 10% not applied to line item 2",
      status: "UNDER_REVIEW" as const,
      resolution_notes: null,
      created_at: "2026-09-05T00:00:00Z",
      updated_at: "2026-09-05T00:00:00Z",
      resolved_at: null,
    },
  ];

  const mockMessages = [
    {
      id: "msg-1",
      invoice_id: "inv-101",
      direction: "INBOUND" as const,
      channel: "EMAIL" as const,
      status: "SENT" as const,
      subject: "Re: Outstanding invoice INV-2026-101",
      body: "We will process the remaining balance by Oct 25th.",
      sent_at: "2026-10-01T12:00:00Z",
      created_at: "2026-10-01T12:00:00Z",
      updated_at: "2026-10-01T12:00:00Z",
    },
  ];

  const mockTimeline = [
    {
      id: "time-1",
      event_type: "PROMISE",
      title: "Promise Registered",
      description: "Customer committed to pay ₹1,00,000 on 2026-10-25",
      created_at: "2026-10-01T12:05:00Z",
    },
  ];

  it("renders customer profile, navigation links, and authoritative financial summaries", async () => {
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomer as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockInvoices as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPayments as any);
    vi.mocked(collectionsApi.getPromises).mockImplementation((invId) =>
      Promise.resolve(invId === "inv-101" ? (mockPromises as any) : [])
    );
    vi.mocked(collectionsApi.getDisputes).mockImplementation((invId) =>
      Promise.resolve(invId === "inv-102" ? (mockDisputes as any) : [])
    );
    vi.mocked(communicationsApi.getMessagesByInvoice).mockImplementation((invId) =>
      Promise.resolve(invId === "inv-101" ? (mockMessages as any) : [])
    );
    vi.mocked(communicationsApi.getTimeline).mockImplementation((invId) =>
      Promise.resolve(invId === "inv-101" ? (mockTimeline as any) : [])
    );

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerDetailPage params={{ customerId: "cust-1" }} />
      </QueryClientProvider>
    );

    // Identity and header checks
    await waitFor(() => {
      expect(screen.getByText("Acme Industrial Corp")).toBeInTheDocument();
      expect(screen.getByText("TID: 27AAACA1234A1Z5")).toBeInTheDocument();
      expect(screen.getByText("Back to Customer Directory")).toBeInTheDocument();
      expect(screen.getByText("Invoices (2)")).toBeInTheDocument();
      expect(screen.getByText("Collections Workspace")).toBeInTheDocument();
    });

    // Authoritative Financial Figures checks
    expect(screen.getAllByText("Outstanding Balance").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Overdue Amount")).toBeInTheDocument();
    expect(screen.getAllByText("Recorded Payments").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Total Invoiced").length).toBeGreaterThanOrEqual(1);

    // Check governance rule banner
    expect(
      screen.getByText(/Financial & Collection Governance Notice:/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Payment promises and customer dispute claims/i)
    ).toBeInTheDocument();
  });

  it("switches to Invoices tab and displays customer invoice balances and links", async () => {
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomer as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockInvoices as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([]);
    vi.mocked(collectionsApi.getPromises).mockResolvedValue([]);
    vi.mocked(collectionsApi.getDisputes).mockResolvedValue([]);
    vi.mocked(communicationsApi.getMessagesByInvoice).mockResolvedValue([]);
    vi.mocked(communicationsApi.getTimeline).mockResolvedValue([]);

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerDetailPage params={{ customerId: "cust-1" }} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial Corp")).toBeInTheDocument();
    });

    // Click Invoices tab
    const invoicesTab = screen.getByRole("tab", { name: /Invoices/i });
    fireEvent.click(invoicesTab);

    await waitFor(() => {
      expect(screen.getByText("INV-2026-101")).toBeInTheDocument();
      expect(screen.getByText("INV-2026-102")).toBeInTheDocument();
      expect(screen.getByText("(15d overdue)")).toBeInTheDocument();
    });
  });

  it("switches to Payments tab and distinguishes fully allocated and reversed payments", async () => {
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomer as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockInvoices as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue(mockPayments as any);
    vi.mocked(collectionsApi.getPromises).mockResolvedValue([]);
    vi.mocked(collectionsApi.getDisputes).mockResolvedValue([]);
    vi.mocked(communicationsApi.getMessagesByInvoice).mockResolvedValue([]);
    vi.mocked(communicationsApi.getTimeline).mockResolvedValue([]);

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerDetailPage params={{ customerId: "cust-1" }} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial Corp")).toBeInTheDocument();
    });

    // Click Payments tab
    const paymentsTab = screen.getByRole("tab", { name: /Payments & Allocations/i });
    fireEvent.click(paymentsTab);

    await waitFor(() => {
      expect(screen.getByText("HDFC-TXN-9988")).toBeInTheDocument();
      expect(screen.getByText("FULLY ALLOCATED")).toBeInTheDocument();
      expect(screen.getByText("REVERSED")).toBeInTheDocument();
      expect(screen.getByText(/Cheque dishonoured by drawer/i)).toBeInTheDocument();
    });
  });

  it("switches to Promises tab and displays active promise and balance notice", async () => {
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomer as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockInvoices as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([]);
    vi.mocked(collectionsApi.getPromises).mockImplementation((invId) =>
      Promise.resolve(invId === "inv-101" ? (mockPromises as any) : [])
    );
    vi.mocked(collectionsApi.getDisputes).mockResolvedValue([]);
    vi.mocked(communicationsApi.getMessagesByInvoice).mockResolvedValue([]);
    vi.mocked(communicationsApi.getTimeline).mockResolvedValue([]);

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerDetailPage params={{ customerId: "cust-1" }} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial Corp")).toBeInTheDocument();
    });

    // Click Promises tab
    const promisesTab = screen.getByRole("tab", { name: /Payment Promises/i });
    fireEvent.click(promisesTab);

    await waitFor(() => {
      expect(screen.getByText("Payment Promise Governance:")).toBeInTheDocument();
      expect(
        screen.getByText(/Promised wire transfer on next payroll run/i)
      ).toBeInTheDocument();
      expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("switches to Disputes tab and displays active dispute under review", async () => {
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomer as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockInvoices as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([]);
    vi.mocked(collectionsApi.getPromises).mockResolvedValue([]);
    vi.mocked(collectionsApi.getDisputes).mockImplementation((invId) =>
      Promise.resolve(invId === "inv-102" ? (mockDisputes as any) : [])
    );
    vi.mocked(communicationsApi.getMessagesByInvoice).mockResolvedValue([]);
    vi.mocked(communicationsApi.getTimeline).mockResolvedValue([]);

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerDetailPage params={{ customerId: "cust-1" }} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial Corp")).toBeInTheDocument();
    });

    // Click Disputes tab
    const disputesTab = screen.getByRole("tab", { name: /Disputes/i });
    fireEvent.click(disputesTab);

    await waitFor(() => {
      expect(screen.getByText("Dispute Verification:")).toBeInTheDocument();
      expect(
        screen.getByText(/Billing discount of 10% not applied to line item 2/i)
      ).toBeInTheDocument();
      expect(screen.getByText("WRONG_AMOUNT")).toBeInTheDocument();
      expect(screen.getByText("Under Review")).toBeInTheDocument();
    });
  });

  it("switches to Activity tab and displays consolidated communications and timeline events", async () => {
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomer as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockInvoices as any);
    vi.mocked(paymentsApi.listPayments).mockResolvedValue([]);
    vi.mocked(collectionsApi.getPromises).mockResolvedValue([]);
    vi.mocked(collectionsApi.getDisputes).mockResolvedValue([]);
    vi.mocked(communicationsApi.getMessagesByInvoice).mockImplementation((invId) =>
      Promise.resolve(invId === "inv-101" ? (mockMessages as any) : [])
    );
    vi.mocked(communicationsApi.getTimeline).mockImplementation((invId) =>
      Promise.resolve(invId === "inv-101" ? (mockTimeline as any) : [])
    );

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerDetailPage params={{ customerId: "cust-1" }} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial Corp")).toBeInTheDocument();
    });

    // Click Communications & Activity tab
    const activityTab = screen.getByRole("tab", {
      name: /Communications & Activity/i,
    });
    fireEvent.click(activityTab);

    await waitFor(() => {
      expect(
        screen.getByText("Invoice-Scoped Consolidated Activity:")
      ).toBeInTheDocument();
      expect(
        screen.getByText(/We will process the remaining balance by Oct 25th./i)
      ).toBeInTheDocument();
      expect(screen.getByText("Promise Registered")).toBeInTheDocument();
    });
  });

  it("renders not found state when customer query fails", async () => {
    vi.mocked(customersApi.get).mockRejectedValue(new Error("Customer not found"));

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerDetailPage params={{ customerId: "nonexistent-id" }} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText("Customer Not Found or Inaccessible")
      ).toBeInTheDocument();
      expect(screen.getByText("Customer not found")).toBeInTheDocument();
      expect(screen.getByText("Back to Directory")).toBeInTheDocument();
    });
  });
});
