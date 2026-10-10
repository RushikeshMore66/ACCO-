import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CommunicationsPage from "@/app/(dashboard)/communications/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { communicationsApi } from "@/lib/api/communications.api";
import { collectionsApi } from "@/lib/api/collections.api";
import { PromiseConfirmationDialog } from "@/app/(dashboard)/communications/PromiseConfirmationDialog";

vi.mock("@/lib/api/communications.api", () => ({
  communicationsApi: {
    listAllMessages: vi.fn(),
    getAnalyses: vi.fn(),
    reviewAnalysis: vi.fn(),
  }
}));

vi.mock("@/lib/api/collections.api", () => ({
  collectionsApi: {
    createPromise: vi.fn(),
  }
}));

vi.mock("@/lib/api/invoices.api", () => ({
  invoicesApi: {
    get: vi.fn().mockResolvedValue({ id: "inv-1", total_amount: 1000, currency: "USD", customer_id: "c-1" }),
  }
}));

vi.mock("@/lib/api/receivables.api", () => ({
  receivablesApi: {
    getInvoices: vi.fn().mockResolvedValue([{ invoice_id: "inv-1", outstanding_amount: 1000 }]),
  }
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
});

describe("Phase 4: Communications & AI Analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads messages and displays inbox", async () => {
    vi.mocked(communicationsApi.listAllMessages).mockResolvedValue([
      { id: "msg-1", subject: "Test subject", body: "Test body", channel: "EMAIL", direction: "INBOUND", status: "RECEIVED", created_at: "2026-01-01" } as any
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <CommunicationsPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Test subject")).toBeInTheDocument();
  });

  it("loads AI analysis when a message is selected", async () => {
    vi.mocked(communicationsApi.listAllMessages).mockResolvedValue([
      { id: "msg-1", subject: "Test subject", body: "Test body", channel: "EMAIL", direction: "INBOUND", status: "RECEIVED", created_at: "2026-01-01" } as any
    ]);
    vi.mocked(communicationsApi.getAnalyses).mockResolvedValue([
      { 
        id: "ana-1", 
        source_message_id: "msg-1", 
        classification: "PAYMENT_PROMISE", 
        confidence_score: 0.95, 
        analysis_payload: { 
          evidence_summary: "Customer promised to pay.",
          primary_classification: "PAYMENT_PROMISE",
          explicit_payment_amount: null,
          proposed_payment_date: null,
          currency: null,
          secondary_classifications: [],
          customer_intent: "",
          claims_already_paid: false,
          dispute_category: null,
          requests_information: false,
          missing_information: null,
          recommended_next_action: "Review",
          requires_human_review: true,
          confidence_score: 0.95
        },
        status: "PENDING_REVIEW" 
      } as any
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <CommunicationsPage />
      </QueryClientProvider>
    );

    // Select the message
    fireEvent.click(await screen.findByText("Test subject"));

    // Verify analysis loaded
    expect(await screen.findByText("PAYMENT PROMISE")).toBeInTheDocument();
    expect(screen.getByText("Accept Analysis")).toBeInTheDocument();
  });

  it("submits promise confirmation and creates promise via canonical API", async () => {
    vi.mocked(collectionsApi.createPromise).mockResolvedValue({ id: "prom-1" } as any);

    const analysis = {
      id: "ana-1",
      source_message_id: "msg-1",
      classification: "PAYMENT_PROMISE",
      confidence_score: 0.95,
      analysis_payload: {
        explicit_payment_amount: 500,
        proposed_payment_date: "2026-10-10"
      },
      status: "ACCEPTED"
    } as any;

    render(
      <PromiseConfirmationDialog 
        isOpen={true} 
        onClose={vi.fn()} 
        analysis={analysis} 
        invoiceId="inv-1" 
      />
    );

    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    
    // Fill required follow up date
    const dateInputs = screen.getAllByDisplayValue(""); // Follow up is empty initially
    fireEvent.change(dateInputs[0], { target: { value: "2026-10-11" } });

    // Submit form
    fireEvent.click(screen.getByText("Confirm Promise"));

    await waitFor(() => {
      expect(collectionsApi.createPromise).toHaveBeenCalledWith("inv-1", expect.objectContaining({
        promised_amount: 500,
        expected_payment_date: expect.stringContaining("2026-10-10"),
        reply_analysis_id: "ana-1",
        source_message_id: "msg-1"
      }));
    });
  });
});
