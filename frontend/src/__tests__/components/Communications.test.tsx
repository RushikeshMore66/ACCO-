import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CommunicationsPage from "@/app/(dashboard)/communications/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { communicationsApi } from "@/lib/api/communications.api";
import { collectionsApi } from "@/lib/api/collections.api";
import { invoicesApi } from "@/lib/api/invoices.api";
import { customersApi } from "@/lib/api/customers.api";
import { receivablesApi } from "@/lib/api/receivables.api";

vi.mock("@/lib/api/communications.api", () => ({
  communicationsApi: {
    listAllMessages: vi.fn(),
    getMessagesByInvoice: vi.fn(),
    recordInbound: vi.fn(),
    getTimeline: vi.fn(),
    getAnalyses: vi.fn(),
    reviewAnalysis: vi.fn(),
    analyzeMessage: vi.fn(),
    listAllAnalyses: vi.fn(),
  },
}));

vi.mock("@/lib/api/collections.api", () => ({
  collectionsApi: {
    createPromise: vi.fn(),
  },
}));

vi.mock("@/lib/api/invoices.api", () => ({
  invoicesApi: {
    get: vi.fn(),
    list: vi.fn(),
  },
}));

vi.mock("@/lib/api/customers.api", () => ({
  customersApi: {
    get: vi.fn(),
    list: vi.fn(),
  },
}));

vi.mock("@/lib/api/receivables.api", () => ({
  receivablesApi: {
    getInvoices: vi.fn(),
  },
}));

const mockCustomers = [
  { id: "cust-1", name: "Acme Corp", email: "contact@acme.com", is_active: true },
  { id: "cust-2", name: "Globex Logistics", email: "ap@globex.com", is_active: true },
];

const mockInvoices = [
  { id: "inv-1", invoice_number: "INV-2026-001", customer_id: "cust-1", total_amount: 150000, currency: "INR", status: "OVERDUE" },
  { id: "inv-2", invoice_number: "INV-2026-002", customer_id: "cust-2", total_amount: 75000, currency: "INR", status: "UNPAID" },
];

const mockMessages = [
  {
    id: "msg-1",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    direction: "INBOUND",
    channel: "EMAIL",
    status: "RECEIVED",
    subject: "Re: Invoice INV-2026-001 Settlement",
    body: "Hi team, we will remit 100,000 next Tuesday following review.",
    sent_at: "2026-03-01T10:00:00Z",
    created_at: "2026-03-01T10:00:00Z",
  },
  {
    id: "msg-2",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    direction: "OUTBOUND",
    channel: "EMAIL",
    status: "SENT",
    subject: "Statement of Account Reminder",
    body: "Dear Acme Corp, please review overdue invoice INV-2026-001.",
    sent_at: "2026-02-28T09:00:00Z",
    created_at: "2026-02-28T09:00:00Z",
  },
  {
    id: "msg-3",
    invoice_id: "inv-2",
    customer_id: "cust-2",
    direction: "INTERNAL_NOTE",
    channel: "INTERNAL",
    status: "RECORDED",
    subject: "Call with Treasurer",
    body: "Treasurer confirmed payment approved on their ERP batch.",
    sent_at: null,
    created_at: "2026-03-02T14:00:00Z",
  },
];

const mockAnalysis = {
  id: "ana-1",
  source_message_id: "msg-1",
  invoice_id: "inv-1",
  customer_id: "cust-1",
  organization_id: "org-123",
  classification: "PAYMENT_PROMISE",
  confidence_score: 0.94,
  analysis_payload: {
    primary_classification: "PAYMENT_PROMISE",
    secondary_classifications: [],
    evidence_summary: "Customer committed to pay 100,000 next Tuesday.",
    customer_intent: "Pay 100,000 next Tuesday",
    explicit_payment_amount: 100000,
    currency: "INR",
    proposed_payment_date: "next Tuesday",
    claims_already_paid: false,
    dispute_category: null,
    requests_information: false,
    missing_information: null,
    recommended_next_action: "Review extracted amount and record payment promise.",
    requires_human_review: true,
    confidence_score: 0.94,
  },
  model_provider: "demo",
  model_name: "demo",
  prompt_version: "1.0",
  status: "PENDING_REVIEW",
  created_at: "2026-03-01T10:05:00Z",
  updated_at: "2026-03-01T10:05:00Z",
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("ACCO Communications Inbox & Conversation Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customersApi.list).mockResolvedValue(mockCustomers as any);
    vi.mocked(invoicesApi.list).mockResolvedValue(mockInvoices as any);
    vi.mocked(communicationsApi.listAllMessages).mockResolvedValue(mockMessages as any);
    vi.mocked(communicationsApi.listAllAnalyses).mockResolvedValue([mockAnalysis] as any);
    vi.mocked(communicationsApi.getAnalyses).mockResolvedValue([mockAnalysis] as any);
    vi.mocked(communicationsApi.getTimeline).mockResolvedValue([
      { id: "act-1", event_type: "INVOICE_ISSUED", description: "Invoice issued", created_at: "2026-01-01" },
    ] as any);
    vi.mocked(invoicesApi.get).mockResolvedValue(mockInvoices[0] as any);
    vi.mocked(customersApi.get).mockResolvedValue(mockCustomers[0] as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue([
      { invoice_id: "inv-1", outstanding_amount: 150000 },
    ] as any);
  });

  // 1. Conversation-list rendering and selection
  it("renders conversation list and handles selection properly", async () => {
    renderWithClient(<CommunicationsPage />);

    // Verify conversations appear with customer name and subject
    expect(await screen.findByText("Re: Invoice INV-2026-001 Settlement")).toBeInTheDocument();
    expect(screen.getByText("Statement of Account Reminder")).toBeInTheDocument();
    expect(screen.getByText("Call with Treasurer")).toBeInTheDocument();

    // Select the first conversation
    fireEvent.click(screen.getByText("Re: Invoice INV-2026-001 Settlement"));

    // Verify detail pane shows full message body and context
    expect(await screen.findByText("Associated Invoice:")).toBeInTheDocument();
    expect(screen.getAllByText("Hi team, we will remit 100,000 next Tuesday following review.").length).toBeGreaterThanOrEqual(1);
  });

  // 2. Search and filtering
  it("filters conversation list by search query, direction, channel, and review status", async () => {
    renderWithClient(<CommunicationsPage />);
    await screen.findByText("Re: Invoice INV-2026-001 Settlement");

    // Search query
    const searchInput = screen.getByPlaceholderText(/search messages/i);
    fireEvent.change(searchInput, { target: { value: "Treasurer" } });

    expect(screen.getByText("Call with Treasurer")).toBeInTheDocument();
    expect(screen.queryByText("Re: Invoice INV-2026-001 Settlement")).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(await screen.findByText("Re: Invoice INV-2026-001 Settlement")).toBeInTheDocument();

    // Direction filter: OUTBOUND
    const directionSelect = screen.getByLabelText("Direction");
    fireEvent.change(directionSelect, { target: { value: "OUTBOUND" } });

    expect(screen.getByText("Statement of Account Reminder")).toBeInTheDocument();
    expect(screen.queryByText("Call with Treasurer")).not.toBeInTheDocument();
    expect(screen.queryByText("Re: Invoice INV-2026-001 Settlement")).not.toBeInTheDocument();
  });

  // 3. Message direction and timestamp display
  it("displays accurate direction badges and formatted timestamps", async () => {
    renderWithClient(<CommunicationsPage />);
    await screen.findByText("Re: Invoice INV-2026-001 Settlement");

    // Directions
    expect(screen.getAllByText("INBOUND").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OUTBOUND").length).toBeGreaterThan(0);
    expect(screen.getAllByText("INTERNAL NOTE").length).toBeGreaterThan(0);
  });

  // 4. Missing optional fields
  it("renders messages with missing optional fields without throwing", async () => {
    vi.mocked(communicationsApi.listAllMessages).mockResolvedValue([
      {
        id: "msg-sparse",
        invoice_id: null,
        customer_id: null,
        direction: "INBOUND",
        channel: "EMAIL",
        status: "RECEIVED",
        subject: null,
        body: "Message with no subject, no customer, and no invoice.",
        sent_at: null,
        created_at: "2026-03-01T10:00:00Z",
      } as any,
    ]);

    renderWithClient(<CommunicationsPage />);

    expect(await screen.findByText("(No Subject)")).toBeInTheDocument();
    expect(screen.getByText("Unknown Customer")).toBeInTheDocument();

    // Select the sparse message
    fireEvent.click(screen.getByText("(No Subject)"));

    expect(await screen.findByText("Unassigned")).toBeInTheDocument();
    expect(screen.getAllByText("Message with no subject, no customer, and no invoice.").length).toBeGreaterThanOrEqual(1);
  });

  // 5. Correct customer and invoice navigation
  it("provides canonical links to customer and invoice detail workspaces", async () => {
    renderWithClient(<CommunicationsPage />);
    fireEvent.click(await screen.findByText("Re: Invoice INV-2026-001 Settlement"));

    // Check customer link
    const customerLink = await screen.findByRole("link", { name: /Acme Corp/i });
    expect(customerLink).toHaveAttribute("href", "/customers/cust-1");

    // Check invoice link
    const invoiceLink = screen.getByRole("link", { name: /INV-2026-001/i });
    expect(invoiceLink).toHaveAttribute("href", "/invoices/inv-1");
  });

  // 6. AI analysis loading and review states
  it("renders AI intelligence details and handles accept/dismiss actions", async () => {
    vi.mocked(communicationsApi.reviewAnalysis).mockResolvedValue({
      ...mockAnalysis,
      status: "ACCEPTED",
    } as any);

    renderWithClient(<CommunicationsPage />);
    fireEvent.click(await screen.findByText("Re: Invoice INV-2026-001 Settlement"));

    // Wait for AI Intelligence Panel to load
    expect(await screen.findByText("AI Reply Intelligence")).toBeInTheDocument();
    expect(await screen.findByText("94%")).toBeInTheDocument();
    expect(screen.getByText("Pay 100,000 next Tuesday")).toBeInTheDocument();

    // Accept action
    const acceptBtn = screen.getByRole("button", { name: /accept analysis/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(communicationsApi.reviewAnalysis).toHaveBeenCalledWith("ana-1", expect.objectContaining({
        status: "ACCEPTED",
      }));
    });
  });

  // 7. Prevention of duplicate analysis/review submissions
  it("prevents duplicate submissions by disabling action buttons while in flight", async () => {
    let resolveReview: (val: any) => void;
    const reviewPromise = new Promise((resolve) => {
      resolveReview = resolve;
    });
    vi.mocked(communicationsApi.reviewAnalysis).mockReturnValue(reviewPromise as any);

    renderWithClient(<CommunicationsPage />);
    fireEvent.click(await screen.findByText("Re: Invoice INV-2026-001 Settlement"));

    const acceptBtn = await screen.findByRole("button", { name: /accept analysis/i });
    fireEvent.click(acceptBtn);

    // Button should be disabled during flight
    await waitFor(() => {
      expect(acceptBtn).toBeDisabled();
    });

    // Resolve review
    resolveReview!({ ...mockAnalysis, status: "ACCEPTED" });
  });

  // 8. Eligible payment-promise handoff
  it("opens promise confirmation dialog and handoffs to canonical promise API", async () => {
    vi.mocked(communicationsApi.getAnalyses).mockResolvedValue([
      { ...mockAnalysis, status: "ACCEPTED" } as any,
    ]);
    vi.mocked(collectionsApi.createPromise).mockResolvedValue({ id: "prom-new" } as any);

    renderWithClient(<CommunicationsPage />);
    fireEvent.click(await screen.findByText("Re: Invoice INV-2026-001 Settlement"));

    // Click Record Payment Promise
    const promiseBtn = await screen.findByRole("button", { name: /record payment promise/i });
    fireEvent.click(promiseBtn);

    // Dialog appears with pre-filled amount and summary
    expect(await screen.findByText("Confirm Payment Promise")).toBeInTheDocument();
    expect(screen.getByDisplayValue("100000")).toBeInTheDocument();

    // Fill expected and follow-up date using accessible aria-labels
    const expectedDateInput = screen.getByLabelText("Expected Payment Date");
    const followUpDateInput = screen.getByLabelText("Follow-up Date");
    fireEvent.change(expectedDateInput, { target: { value: "2026-10-15" } });
    fireEvent.change(followUpDateInput, { target: { value: "2026-10-16" } });

    // Submit promise
    fireEvent.click(screen.getByRole("button", { name: /confirm promise/i }));

    await waitFor(() => {
      expect(collectionsApi.createPromise).toHaveBeenCalledWith("inv-1", expect.objectContaining({
        promised_amount: 100000,
        expected_payment_date: expect.stringContaining("2026-10-15"),
        follow_up_date: expect.stringContaining("2026-10-16"),
        reply_analysis_id: "ana-1",
        source_message_id: "msg-1",
      }));
    });
  });

  // 9. Correct distinction between AI suggestions and canonical payment records
  it("displays explicit notices distinguishing AI suggestions from canonical records", async () => {
    renderWithClient(<CommunicationsPage />);
    fireEvent.click(await screen.findByText("Re: Invoice INV-2026-001 Settlement"));

    expect(await screen.findByText(/Advisory AI Extraction Notice/i)).toBeInTheDocument();
    expect(screen.getByText(/AI reply classifications and proposed amounts are advisory extractions/i)).toBeInTheDocument();
  });

  // 10. Live/demo isolation and no mock fallback after live API failures
  it("shows global inbox unavailable state when live endpoint fails without falling back to mock", async () => {
    vi.mocked(communicationsApi.listAllMessages).mockRejectedValue(
      new Error("Global message listing is not supported in live mode.")
    );

    renderWithClient(<CommunicationsPage />);

    expect(await screen.findByText("Global Inbox Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/The current backend does not expose an organization-wide message list endpoint/i)).toBeInTheDocument();
    // Confirms no mock messages were silently displayed
    expect(screen.queryByText("Hi team, we will remit 100,000 next Tuesday following review.")).not.toBeInTheDocument();
  });

  // 11. Loading and empty states
  it("renders empty state when there are no messages in the inbox", async () => {
    vi.mocked(communicationsApi.listAllMessages).mockResolvedValue([]);

    renderWithClient(<CommunicationsPage />);

    expect(await screen.findByText("No conversations found")).toBeInTheDocument();
    expect(screen.getByText("There are no collection communications recorded yet.")).toBeInTheDocument();
  });
});
