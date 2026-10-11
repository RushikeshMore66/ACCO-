import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import InvoicesDirectoryPage from "@/app/(dashboard)/invoices/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoicesApi } from "@/lib/api/invoices.api";
import { customersApi } from "@/lib/api/customers.api";
import { receivablesApi } from "@/lib/api/receivables.api";

vi.mock("@/lib/api/invoices.api", () => ({
  invoicesApi: {
    list: vi.fn(),
  },
}));

vi.mock("@/lib/api/customers.api", () => ({
  customersApi: {
    list: vi.fn(),
  },
}));

vi.mock("@/lib/api/receivables.api", () => ({
  receivablesApi: {
    getInvoices: vi.fn(),
  },
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => "/invoices",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

let queryClient: QueryClient;

describe("Invoices Directory Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  });

  const mockCustomers = [
    { id: "cust-1", name: "Acme Corp", email: "acme@example.com", is_active: true },
    { id: "cust-2", name: "Globex Inc", email: "globex@example.com", is_active: true },
  ];

  const mockInvoices = [
    {
      id: "inv-1",
      customer_id: "cust-1",
      invoice_number: "INV-2026-001",
      issue_date: "2026-09-10T00:00:00Z",
      due_date: "2026-09-25T00:00:00Z",
      currency: "INR",
      total_amount: "150000.00",
      description: "Software Services Q3",
      status: "ISSUED" as const,
      void_reason: null,
      created_at: "2026-09-10T00:00:00Z",
      updated_at: "2026-09-10T00:00:00Z",
      voided_at: null,
    },
    {
      id: "inv-2",
      customer_id: "cust-2",
      invoice_number: "INV-2026-002",
      issue_date: "2026-10-01T00:00:00Z",
      due_date: "2026-10-20T00:00:00Z",
      currency: "INR",
      total_amount: "75000.00",
      description: "Consulting Retainer",
      status: "ISSUED" as const,
      void_reason: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
      voided_at: null,
    },
    {
      id: "inv-3",
      customer_id: "cust-1",
      invoice_number: "INV-2026-003",
      issue_date: "2026-10-05T00:00:00Z",
      due_date: "2026-10-25T00:00:00Z",
      currency: "INR",
      total_amount: "50000.00",
      description: "Draft Contract Work",
      status: "DRAFT" as const,
      void_reason: null,
      created_at: "2026-10-05T00:00:00Z",
      updated_at: "2026-10-05T00:00:00Z",
      voided_at: null,
    },
  ];

  const mockBalances = [
    {
      invoice_id: "inv-1",
      customer_id: "cust-1",
      invoice_number: "INV-2026-001",
      currency: "INR",
      total_amount: "150000.00",
      paid_amount: "50000.00",
      outstanding_amount: "100000.00",
      days_overdue: 16,
      payment_status: "PARTIALLY_PAID" as const,
      aging_bucket: "1_30" as const,
    },
    {
      invoice_id: "inv-2",
      customer_id: "cust-2",
      invoice_number: "INV-2026-002",
      currency: "INR",
      total_amount: "75000.00",
      paid_amount: "0.00",
      outstanding_amount: "75000.00",
      days_overdue: 0,
      payment_status: "UNPAID" as const,
      aging_bucket: "NOT_DUE" as const,
    },
  ];

  it("renders all required directory columns and customer linkages", async () => {
    vi.mocked(customersApi.list).mockResolvedValue(mockCustomers as any);
    vi.mocked(invoicesApi.list).mockResolvedValue(mockInvoices as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockBalances as any);

    render(
      <QueryClientProvider client={queryClient}>
        <InvoicesDirectoryPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("INV-2026-001")).toBeInTheDocument();
      expect(screen.getByText("INV-2026-002")).toBeInTheDocument();
      expect(screen.getByText("INV-2026-003")).toBeInTheDocument();
    });

    // Check table headers
    expect(screen.getByText("Invoice #")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("Issue Date")).toBeInTheDocument();
    expect(screen.getByText("Due Date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Total/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Paid/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Outstanding/i })).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();

    // Check customer names resolved and linked
    const acmeLinks = screen.getAllByRole("link", { name: "Acme Corp" });
    expect(acmeLinks.length).toBeGreaterThanOrEqual(1);
    expect(acmeLinks[0]).toHaveAttribute("href", "/customers/cust-1");

    const globexLink = screen.getByRole("link", { name: "Globex Inc" });
    expect(globexLink).toHaveAttribute("href", "/customers/cust-2");

    // Check invoice number link
    const inv1Link = screen.getByText("INV-2026-001");
    expect(inv1Link.closest("a")).toHaveAttribute("href", "/invoices/inv-1");

    // Check financial amounts
    expect(screen.getByText("₹1,50,000")).toBeInTheDocument();
    expect(screen.getAllByText("₹50,000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("₹1,00,000")).toBeInTheDocument();
  });

  it("displays dataset completeness limitation banner and pagination controls", async () => {
    vi.mocked(customersApi.list).mockResolvedValue(mockCustomers as any);
    vi.mocked(invoicesApi.list).mockResolvedValue(mockInvoices as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockBalances as any);

    render(
      <QueryClientProvider client={queryClient}>
        <InvoicesDirectoryPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Showing up to 50 records on Page 1/)).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    // Invoices list returned 3 (< 50 PAGE_SIZE), so Next page is disabled
    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  it("hydrates and filters by aging-bucket when navigated from Dashboard or Collections", async () => {
    mockSearchParams = new URLSearchParams("bucket=1_30");

    vi.mocked(customersApi.list).mockResolvedValue(mockCustomers as any);
    vi.mocked(invoicesApi.list).mockResolvedValue(mockInvoices as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockBalances as any);

    render(
      <QueryClientProvider client={queryClient}>
        <InvoicesDirectoryPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("INV-2026-001")).toBeInTheDocument();
    });

    // Only inv-1 is in aging bucket 1_30
    expect(screen.queryByText("INV-2026-002")).not.toBeInTheDocument();
    expect(screen.queryByText("INV-2026-003")).not.toBeInTheDocument();
  });

  it("filters correctly by client-side text search across invoice # and description", async () => {
    vi.mocked(customersApi.list).mockResolvedValue(mockCustomers as any);
    vi.mocked(invoicesApi.list).mockResolvedValue(mockInvoices as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockBalances as any);

    render(
      <QueryClientProvider client={queryClient}>
        <InvoicesDirectoryPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("INV-2026-001")).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText("Search");
    fireEvent.change(searchInput, { target: { value: "Retainer" } });

    await waitFor(() => {
      expect(screen.getByText("INV-2026-002")).toBeInTheDocument();
      expect(screen.queryByText("INV-2026-001")).not.toBeInTheDocument();
      expect(screen.queryByText("INV-2026-003")).not.toBeInTheDocument();
    });
  });

  it("renders empty state with Clear All Filters when no records match", async () => {
    mockSearchParams = new URLSearchParams("search=NonExistentInvoice999");

    vi.mocked(customersApi.list).mockResolvedValue(mockCustomers as any);
    vi.mocked(invoicesApi.list).mockResolvedValue(mockInvoices as any);
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue(mockBalances as any);

    render(
      <QueryClientProvider client={queryClient}>
        <InvoicesDirectoryPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("No invoices found")).toBeInTheDocument();
    });

    expect(screen.getByText("Clear all filters")).toBeInTheDocument();
  });

  it("renders error state when invoice service fails", async () => {
    vi.mocked(customersApi.list).mockResolvedValue([]);
    vi.mocked(invoicesApi.list).mockRejectedValue(new Error("Network failure"));
    vi.mocked(receivablesApi.getInvoices).mockResolvedValue([]);

    render(
      <QueryClientProvider client={queryClient}>
        <InvoicesDirectoryPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Unable to load invoices")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });
});
