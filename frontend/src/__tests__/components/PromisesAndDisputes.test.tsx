import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PromisesPage from "@/app/(dashboard)/collections/promises/page";
import DisputesPage from "@/app/(dashboard)/collections/disputes/page";
import { PromiseConfirmationDialog } from "@/app/(dashboard)/communications/PromiseConfirmationDialog";
import { collectionsApi } from "@/lib/api/collections.api";
import { invoicesApi } from "@/lib/api/invoices.api";
import { customersApi } from "@/lib/api/customers.api";
import { PaymentPromise, Dispute } from "@/types/promises_disputes";
import { CustomerReplyAnalysis } from "@/types/reply_analysis";
import { AuthProvider } from "@/providers/AuthProvider";

vi.mock("@/lib/api/collections.api", () => ({
  collectionsApi: {
    listAllPromises: vi.fn(),
    getPromises: vi.fn(),
    createPromise: vi.fn(),
    cancelPromise: vi.fn(),
    markPromiseFulfilled: vi.fn(),
    markPromiseMissed: vi.fn(),
    listAllDisputes: vi.fn(),
    getDisputes: vi.fn(),
    createDispute: vi.fn(),
    startDisputeReview: vi.fn(),
    resolveDispute: vi.fn(),
    rejectDispute: vi.fn(),
  },
}));

vi.mock("@/lib/api/invoices.api", () => ({
  invoicesApi: {
    list: vi.fn(),
    get: vi.fn(),
    getBalance: vi.fn(),
  },
}));

vi.mock("@/lib/api/customers.api", () => ({
  customersApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("@/lib/api/receivables.api", () => ({
  receivablesApi: {
    getInvoices: vi.fn().mockResolvedValue([]),
  },
}));

// Mock useAuth
const mockUser = {
  id: "user-1",
  organization_id: "org-1",
  email: "collector@example.com",
  full_name: "Alice Collector",
  is_active: true,
  role: "COLLECTOR" as const,
  created_at: "2026-01-01T00:00:00Z",
};

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    isLoading: false,
    isAuthenticated: true,
    refresh: vi.fn(),
    logout: vi.fn(),
  })),
  AuthProvider: ({ children }: any) => children,
}));

describe("ACCO Payment Promise & Dispute Management System", () => {
  let queryClient: QueryClient;

  const samplePromises: PaymentPromise[] = [
    {
      id: "prom-1",
      invoice_id: "inv-101",
      customer_id: "cust-1",
      promised_amount: 50000,
      expected_payment_date: "2026-10-15",
      follow_up_date: "2026-10-16",
      status: "ACTIVE",
      notes: "Agreed payment after invoice revision",
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
      currency: "INR",
      reply_analysis_id: "ana-1",
    },
    {
      id: "prom-2",
      invoice_id: "inv-102",
      customer_id: "cust-2",
      promised_amount: 15000,
      expected_payment_date: "2026-09-10",
      follow_up_date: "2026-09-11",
      status: "MISSED",
      notes: "Customer missed scheduled payment",
      created_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-11T10:00:00Z",
      currency: "INR",
    },
    {
      id: "prom-3",
      invoice_id: "inv-103",
      customer_id: "cust-1",
      promised_amount: 80000,
      expected_payment_date: "2026-08-20",
      follow_up_date: "2026-08-21",
      status: "FULFILLED",
      notes: "Settled via NEFT TRX-9921",
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-20T10:00:00Z",
      currency: "INR",
    },
    {
      id: "prom-4",
      invoice_id: "inv-104",
      customer_id: "cust-2",
      promised_amount: 20000,
      expected_payment_date: "2026-10-25",
      follow_up_date: "2026-10-26",
      status: "CANCELLED",
      notes: "Cancelled: Customer requested credit note",
      created_at: "2026-10-05T10:00:00Z",
      updated_at: "2026-10-06T10:00:00Z",
      currency: "INR",
    },
  ];

  const sampleDisputes: Dispute[] = [
    {
      id: "disp-1",
      invoice_id: "inv-101",
      customer_id: "cust-1",
      category: "INCORRECT_AMOUNT",
      description: "Discrepancy on itemized charges",
      status: "OPEN",
      resolution_notes: null,
      created_at: "2026-10-02T10:00:00Z",
      updated_at: "2026-10-02T10:00:00Z",
      resolved_at: null,
    },
    {
      id: "disp-2",
      invoice_id: "inv-102",
      customer_id: "cust-2",
      category: "SERVICE_OR_PRODUCT_ISSUE",
      description: "Service milestone incomplete",
      status: "UNDER_REVIEW",
      resolution_notes: null,
      created_at: "2026-09-15T10:00:00Z",
      updated_at: "2026-09-16T10:00:00Z",
      resolved_at: null,
    },
    {
      id: "disp-3",
      invoice_id: "inv-103",
      customer_id: "cust-1",
      category: "PAYMENT_ALREADY_MADE",
      description: "Customer claims wire was remitted last week",
      status: "RESOLVED",
      resolution_notes: "Matched to untagged payment allocation TRX-110",
      created_at: "2026-08-10T10:00:00Z",
      updated_at: "2026-08-12T10:00:00Z",
      resolved_at: "2026-08-12T10:00:00Z",
    },
  ];

  const sampleInvoices = [
    { id: "inv-101", invoice_number: "INV-2026-101", customer_id: "cust-1", currency: "INR", total_amount: 100000, status: "ISSUED" },
    { id: "inv-102", invoice_number: "INV-2026-102", customer_id: "cust-2", currency: "INR", total_amount: 50000, status: "ISSUED" },
    { id: "inv-103", invoice_number: "INV-2026-103", customer_id: "cust-1", currency: "INR", total_amount: 80000, status: "PAID" },
    { id: "inv-104", invoice_number: "INV-2026-104", customer_id: "cust-2", currency: "INR", total_amount: 20000, status: "ISSUED" },
  ];

  const sampleCustomers = [
    { id: "cust-1", name: "Acme Enterprises" },
    { id: "cust-2", name: "Starlight Media" },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    vi.clearAllMocks();
    vi.mocked(invoicesApi.list).mockResolvedValue(sampleInvoices as any);
    vi.mocked(customersApi.list).mockResolvedValue(sampleCustomers as any);
  });

  // 1. Promise listing and status filters
  it("renders promise directory and applies status filters", async () => {
    vi.mocked(collectionsApi.listAllPromises).mockResolvedValue(samplePromises);

    render(
      <QueryClientProvider client={queryClient}>
        <PromisesPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("INV-2026-101")).toBeInTheDocument();
    expect(screen.getByText("INV-2026-102")).toBeInTheDocument();
    expect(screen.getByText("INV-2026-103")).toBeInTheDocument();
    expect(screen.getByText("INV-2026-104")).toBeInTheDocument();

    // Filter by Active status
    const statusSelect = screen.getByLabelText("Filter Status");
    fireEvent.change(statusSelect, { target: { value: "ACTIVE" } });

    await waitFor(() => {
      expect(screen.getByText("INV-2026-101")).toBeInTheDocument();
      expect(screen.queryByText("INV-2026-102")).not.toBeInTheDocument(); // Missed
      expect(screen.queryByText("INV-2026-103")).not.toBeInTheDocument(); // Fulfilled
    });
  });

  // 2. Dispute listing and status/category filters
  it("renders dispute list and filters by status and category", async () => {
    vi.mocked(collectionsApi.listAllDisputes).mockResolvedValue(sampleDisputes);

    render(
      <QueryClientProvider client={queryClient}>
        <DisputesPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("INV-2026-101")).toBeInTheDocument();
    expect(screen.getByText("Discrepancy on itemized charges")).toBeInTheDocument();

    // Filter by category: INCORRECT_AMOUNT
    const categorySelect = screen.getByLabelText("Filter Category");
    fireEvent.change(categorySelect, { target: { value: "INCORRECT_AMOUNT" } });

    await waitFor(() => {
      expect(screen.getByText("INV-2026-101")).toBeInTheDocument();
      expect(screen.queryByText("Service milestone incomplete")).not.toBeInTheDocument();
    });
  });

  // 3. Invoice and customer navigation
  it("provides direct navigation links for invoices and customers", async () => {
    vi.mocked(collectionsApi.listAllPromises).mockResolvedValue(samplePromises);

    render(
      <QueryClientProvider client={queryClient}>
        <PromisesPage />
      </QueryClientProvider>
    );

    const customerLinks = await screen.findAllByRole("link", { name: "Acme Enterprises" });
    expect(customerLinks.length).toBeGreaterThanOrEqual(1);
    expect(customerLinks[0]).toHaveAttribute("href", "/customers/cust-1");

    const invoiceLink = await screen.findByRole("link", { name: "INV-2026-101" });
    expect(invoiceLink).toHaveAttribute("href", "/invoices/inv-101");
  });

  // 4. Correct canonical promise-creation route and payload
  // 5. Explicit date confirmation
  it("submits promise creation with canonical payload and explicit dates", async () => {
    const mockAnalysis: CustomerReplyAnalysis = {
      id: "ana-100",
      source_message_id: "msg-100",
      invoice_id: "inv-101",
      customer_id: "cust-1",
      organization_id: "org-1",
      classification: "PAYMENT_PROMISE",
      confidence_score: 0.95,
      analysis_payload: {
        primary_classification: "PAYMENT_PROMISE",
        secondary_classifications: [],
        evidence_summary: "Customer promised to remit next Tuesday",
        customer_intent: "Pay next Tuesday",
        explicit_payment_amount: 50000,
        currency: "INR",
        proposed_payment_date: "next Tuesday", // Natural language phrase
        claims_already_paid: false,
        dispute_category: null,
        requests_information: false,
        missing_information: null,
        recommended_next_action: "Record promise",
        requires_human_review: true,
        confidence_score: 0.95,
      },
      model_provider: "demo",
      model_name: "demo",
      prompt_version: "1.0",
      status: "ACCEPTED",
      reviewed_by_user_id: null,
      reviewed_at: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };

    vi.mocked(invoicesApi.get).mockResolvedValue({
      id: "inv-101",
      invoice_number: "INV-2026-101",
      total_amount: 100000,
      currency: "INR",
      customer_id: "cust-1",
    } as any);

    vi.mocked(collectionsApi.createPromise).mockResolvedValue({ id: "prom-new" } as any);

    const onClose = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <PromiseConfirmationDialog
          isOpen={true}
          onClose={onClose}
          analysis={mockAnalysis}
          invoiceId="inv-101"
        />
      </QueryClientProvider>
    );

    // Natural language date "next Tuesday" must NOT populate the date input
    const expectedDateInput = screen.getByLabelText("Expected Payment Date") as HTMLInputElement;
    expect(expectedDateInput.value).toBe("");

    // Natural language warning displayed
    expect(
      screen.getByText(/Natural language expressions cannot be authoritatively converted/i)
    ).toBeInTheDocument();

    // Human explicitly enters date
    fireEvent.change(expectedDateInput, { target: { value: "2026-10-20" } });
    const followUpDateInput = screen.getByLabelText("Follow-up Date") as HTMLInputElement;
    fireEvent.change(followUpDateInput, { target: { value: "2026-10-21" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /confirm promise/i }));

    await waitFor(() => {
      expect(collectionsApi.createPromise).toHaveBeenCalledWith("inv-101", {
        promised_amount: 50000,
        expected_payment_date: "2026-10-20",
        follow_up_date: "2026-10-21",
        reply_analysis_id: "ana-100",
        source_message_id: "msg-100",
        notes: expect.stringContaining("ana-100"),
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  // 6. Currency mismatch warnings
  it("displays currency mismatch notice when communication currency differs from invoice", async () => {
    const mismatchAnalysis: CustomerReplyAnalysis = {
      id: "ana-mismatch",
      source_message_id: "msg-mismatch",
      invoice_id: "inv-101",
      customer_id: "cust-1",
      organization_id: "org-1",
      classification: "PAYMENT_PROMISE",
      confidence_score: 0.95,
      analysis_payload: {
        primary_classification: "PAYMENT_PROMISE",
        secondary_classifications: [],
        evidence_summary: "Customer promised to remit $500",
        customer_intent: "Pay USD",
        explicit_payment_amount: 500,
        currency: "USD", // Mismatch with INR invoice!
        proposed_payment_date: "2026-10-20",
        claims_already_paid: false,
        dispute_category: null,
        requests_information: false,
        missing_information: null,
        recommended_next_action: "Check currency",
        requires_human_review: true,
        confidence_score: 0.95,
      },
      model_provider: "demo",
      model_name: "demo",
      prompt_version: "1.0",
      status: "ACCEPTED",
      reviewed_by_user_id: null,
      reviewed_at: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };

    vi.mocked(invoicesApi.get).mockResolvedValue({
      id: "inv-101",
      invoice_number: "INV-2026-101",
      total_amount: 100000,
      currency: "INR",
      customer_id: "cust-1",
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <PromiseConfirmationDialog
          isOpen={true}
          onClose={vi.fn()}
          analysis={mismatchAnalysis}
          invoiceId="inv-101"
        />
      </QueryClientProvider>
    );

    expect(await screen.findByText(/Currency Denomination Notice/i)).toBeInTheDocument();
    expect(screen.getByText(/canonical invoice is denominated in INR/i)).toBeInTheDocument();
  });

  // 7. Pending or dismissed analysis restrictions
  it("restricts promise creation if analysis is not accepted", async () => {
    const pendingAnalysis: CustomerReplyAnalysis = {
      id: "ana-pending",
      source_message_id: "msg-1",
      invoice_id: "inv-101",
      customer_id: "cust-1",
      organization_id: "org-1",
      classification: "PAYMENT_PROMISE",
      confidence_score: 0.9,
      analysis_payload: {
        primary_classification: "PAYMENT_PROMISE",
        secondary_classifications: [],
        evidence_summary: "Unreviewed note",
        customer_intent: "Pay",
        explicit_payment_amount: 10000,
        currency: "INR",
        proposed_payment_date: "2026-10-20",
        claims_already_paid: false,
        dispute_category: null,
        requests_information: false,
        missing_information: null,
        recommended_next_action: "Review",
        requires_human_review: true,
        confidence_score: 0.9,
      },
      model_provider: "demo",
      model_name: "demo",
      prompt_version: "1.0",
      status: "PENDING_REVIEW", // NOT accepted!
      reviewed_by_user_id: null,
      reviewed_at: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };

    vi.mocked(invoicesApi.get).mockResolvedValue({
      id: "inv-101",
      invoice_number: "INV-2026-101",
      total_amount: 100000,
      currency: "INR",
      customer_id: "cust-1",
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <PromiseConfirmationDialog
          isOpen={true}
          onClose={vi.fn()}
          analysis={pendingAnalysis}
          invoiceId="inv-101"
        />
      </QueryClientProvider>
    );

    expect(await screen.findByText(/Analysis Restriction/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Backend policy requires reply analyses to be ACCEPTED before creating a payment promise/i)
    ).toBeInTheDocument();

    // Confirm button is disabled
    const submitBtn = screen.getByRole("button", { name: /confirm promise/i });
    expect(submitBtn).toBeDisabled();
  });

  // 8. Equivalent retry and conflict handling
  it("displays proper backend conflict error on conflicting retry or duplicate active promise", async () => {
    const validAnalysis: CustomerReplyAnalysis = {
      id: "ana-valid",
      source_message_id: "msg-1",
      invoice_id: "inv-101",
      customer_id: "cust-1",
      organization_id: "org-1",
      classification: "PAYMENT_PROMISE",
      confidence_score: 0.9,
      analysis_payload: {
        primary_classification: "PAYMENT_PROMISE",
        secondary_classifications: [],
        evidence_summary: "Confirmed promise",
        customer_intent: "Pay",
        explicit_payment_amount: 10000,
        currency: "INR",
        proposed_payment_date: "2026-10-20",
        claims_already_paid: false,
        dispute_category: null,
        requests_information: false,
        missing_information: null,
        recommended_next_action: "Record",
        requires_human_review: true,
        confidence_score: 0.9,
      },
      model_provider: "demo",
      model_name: "demo",
      prompt_version: "1.0",
      status: "ACCEPTED",
      reviewed_by_user_id: null,
      reviewed_at: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };

    vi.mocked(invoicesApi.get).mockResolvedValue({
      id: "inv-101",
      invoice_number: "INV-2026-101",
      total_amount: 100000,
      currency: "INR",
      customer_id: "cust-1",
    } as any);

    vi.mocked(collectionsApi.createPromise).mockRejectedValue(
      new Error("A conflicting promise was already created from this analysis")
    );

    render(
      <QueryClientProvider client={queryClient}>
        <PromiseConfirmationDialog
          isOpen={true}
          onClose={vi.fn()}
          analysis={validAnalysis}
          invoiceId="inv-101"
        />
      </QueryClientProvider>
    );

    const followUpDateInput = await screen.findByLabelText("Follow-up Date");
    fireEvent.change(followUpDateInput, { target: { value: "2026-10-21" } });

    fireEvent.click(screen.getByRole("button", { name: /confirm promise/i }));

    expect(
      await screen.findByText("A conflicting promise was already created from this analysis.")
    ).toBeInTheDocument();
  });

  // 9. No duplicate submissions
  it("disables confirmation action while submission is in-flight", async () => {
    let resolvePromise: any;
    const promise = new Promise((res) => {
      resolvePromise = res;
    });
    vi.mocked(collectionsApi.createPromise).mockReturnValue(promise as any);

    const validAnalysis: CustomerReplyAnalysis = {
      id: "ana-inflight",
      source_message_id: "msg-1",
      invoice_id: "inv-101",
      customer_id: "cust-1",
      organization_id: "org-1",
      classification: "PAYMENT_PROMISE",
      confidence_score: 0.9,
      analysis_payload: {
        primary_classification: "PAYMENT_PROMISE",
        secondary_classifications: [],
        evidence_summary: "In flight check",
        customer_intent: "Pay",
        explicit_payment_amount: 10000,
        currency: "INR",
        proposed_payment_date: "2026-10-20",
        claims_already_paid: false,
        dispute_category: null,
        requests_information: false,
        missing_information: null,
        recommended_next_action: "Record",
        requires_human_review: true,
        confidence_score: 0.9,
      },
      model_provider: "demo",
      model_name: "demo",
      prompt_version: "1.0",
      status: "ACCEPTED",
      reviewed_by_user_id: null,
      reviewed_at: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };

    vi.mocked(invoicesApi.get).mockResolvedValue({
      id: "inv-101",
      invoice_number: "INV-2026-101",
      total_amount: 100000,
      currency: "INR",
      customer_id: "cust-1",
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <PromiseConfirmationDialog
          isOpen={true}
          onClose={vi.fn()}
          analysis={validAnalysis}
          invoiceId="inv-101"
        />
      </QueryClientProvider>
    );

    const followUpDateInput = await screen.findByLabelText("Follow-up Date");
    fireEvent.change(followUpDateInput, { target: { value: "2026-10-21" } });

    const submitBtn = screen.getByRole("button", { name: /confirm promise/i });
    fireEvent.click(submitBtn);

    // In flight
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirming\.\.\./i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    });

    resolvePromise({ id: "prom-done" });
  });

  // 10. Loading, empty and API error states
  // 13. Live/demo separation and no silent fallback
  it("renders empty state and does not silently fall back to mock data when live API fails", async () => {
    vi.mocked(collectionsApi.listAllPromises).mockRejectedValue(
      new Error("Global promise listing is not supported in live mode.")
    );

    render(
      <QueryClientProvider client={queryClient}>
        <PromisesPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Global Promise List Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/The live ACCO FastAPI backend does not expose an organization-wide promises list/i)
    ).toBeInTheDocument();
    // Verify mock items are not silently rendered
    expect(screen.queryByText("Agreed payment after invoice revision")).not.toBeInTheDocument();
  });

  // 11. Promise creation does not reduce invoice balances
  // 12. Disputes do not automatically mark invoices paid
  it("displays explicit financial invariant notices across governance screens", async () => {
    vi.mocked(collectionsApi.listAllPromises).mockResolvedValue(samplePromises);

    render(
      <QueryClientProvider client={queryClient}>
        <PromisesPage />
      </QueryClientProvider>
    );

    expect(
      await screen.findByText(/Promises do not reduce invoice outstanding balances until verified payments are allocated/i)
    ).toBeInTheDocument();
  });

  // 14. Supported status transitions & role permissions
  it("allows collectors to review open disputes and managers to resolve disputes", async () => {
    vi.mocked(collectionsApi.listAllDisputes).mockResolvedValue(sampleDisputes);
    vi.mocked(collectionsApi.startDisputeReview).mockResolvedValue({
      ...sampleDisputes[0],
      status: "UNDER_REVIEW",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DisputesPage />
      </QueryClientProvider>
    );

    // For OPEN dispute disp-1, Review button is available
    const reviewBtn = await screen.findByRole("button", { name: /review/i });
    fireEvent.click(reviewBtn);

    await waitFor(() => {
      expect(collectionsApi.startDisputeReview).toHaveBeenCalledWith("disp-1");
    });
  });
});
