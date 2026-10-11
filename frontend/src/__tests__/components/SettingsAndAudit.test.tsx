import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "@/app/(dashboard)/settings/page";
import AuditLogPage from "@/app/(dashboard)/settings/audit/page";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api/settings.api";
import { CollectionPolicy, AppNotification, AuditEvent } from "@/types/collections";

// Mocks
const mockUseDemoMode = vi.fn();
const mockUseAuth = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/settings",
}));

vi.mock("@/providers/DemoModeProvider", () => ({
  useDemoMode: () => mockUseDemoMode(),
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/api/settings.api", () => ({
  settingsApi: {
    getCollectionPolicy: vi.fn(),
    updateCollectionPolicy: vi.fn(),
    getOrganizationProfile: vi.fn(),
    updateOrganizationProfile: vi.fn(),
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    listAuditEvents: vi.fn(),
  },
}));

const mockPolicy: CollectionPolicy = {
  id: "pol-1",
  organization_id: "org-1",
  initial_reminder_after_days: 1,
  follow_up_after_days: 8,
  escalation_after_days: 31,
  require_approval_before_send: true,
  pause_collection_on_dispute: true,
  pause_collection_on_payment_promise: true,
};

const mockNotifications: AppNotification[] = [
  {
    id: "notif-1",
    type: "INVOICE_OVERDUE",
    title: "Invoice #INV-2026-001 Overdue",
    message: "Invoice for Acme Corp (150,000 INR) is past due date.",
    timestamp: "2026-10-11T12:00:00.000Z",
    read: false,
    href: "/invoices/inv-1",
  },
  {
    id: "notif-2",
    type: "PAYMENT_RECORDED",
    title: "New Payment Receipt",
    message: "Payment of 1,500.00 INR recorded.",
    timestamp: "2026-10-11T11:00:00.000Z",
    read: true,
    href: "/collections/payments",
  },
];

const mockAuditEvents: AuditEvent[] = [
  {
    id: "audit-1",
    event_type: "PAYMENT_ALLOCATED",
    actor: "Alice Admin (Owner)",
    target: "INV-2026-001",
    target_id: "inv-1",
    description: "Allocated 1,500.00 INR payment receipt TRX-829103 to invoice balance.",
    created_at: "2026-10-11T12:00:00.000Z",
    is_demo: true,
  },
  {
    id: "audit-2",
    event_type: "DISPUTE_OPENED",
    actor: "System AI",
    target: "INV-2026-002",
    target_id: "inv-2",
    description: "Inbound customer inquiry flagged potential billing discrepancy.",
    created_at: "2026-10-11T10:00:00.000Z",
    is_demo: true,
  },
];

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("ACCO Administration: Settings, Notifications & Activity Log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: "auth-u1",
        organization_id: "org-real-123",
        full_name: "Alice Owner",
        email: "alice@company.example",
        role: "OWNER",
      },
      isLoading: false,
      isAuthenticated: true,
    });
  });

  // --- SETTINGS TESTS ---
  describe("Settings Interface", () => {
    it("1. renders Settings sections and navigates between tabs", async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: true });
      vi.mocked(settingsApi.getCollectionPolicy).mockResolvedValue(mockPolicy);

      renderWithClient(<SettingsPage />);

      expect(screen.getByText("System & Administration Settings")).toBeInTheDocument();
      expect(screen.getByText("Demo Mode Only")).toBeInTheDocument();

      // Check section tabs
      expect(screen.getByRole("button", { name: /Organization Profile/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Collection Policies/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Account Preferences/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Notification Preferences/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Communication Channels/i })).toBeInTheDocument();

      // Switch to Collection Policies tab
      const policyTab = screen.getByRole("button", { name: /Collection Policies/i });
      await userEvent.click(policyTab);

      expect(screen.getByText("Deterministic Collection Policies")).toBeInTheDocument();
      expect(screen.getByText("Mandatory Human Approval Before Dispatch")).toBeInTheDocument();
    });

    it("2. shows live unsupported state for Organization Profile while keeping live Collection Policy enabled", async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: false });
      vi.mocked(settingsApi.getCollectionPolicy).mockResolvedValue(mockPolicy);

      renderWithClient(<SettingsPage />);

      expect(screen.getByText("Live Organization")).toBeInTheDocument();
      // Organization tab shows live backend notice
      expect(screen.getByText(/The FastAPI organization router/i)).toBeInTheDocument();
      expect(screen.getByText("org-real-123")).toBeInTheDocument();

      // Switch to Collection Policies
      const policyTab = screen.getByRole("button", { name: /Collection Policies/i });
      await userEvent.click(policyTab);

      // Collection policies form is enabled because OWNER has rights and backend is live
      const saveBtn = screen.getByRole("button", { name: /Save Collection Policy/i });
      expect(saveBtn).not.toBeDisabled();
    });

    it("3. restricts Collection Policy changes if user role is VIEWER or COLLECTOR", async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: false });
      mockUseAuth.mockReturnValue({
        user: {
          id: "auth-col-1",
          organization_id: "org-real-123",
          full_name: "Charlie Collector",
          email: "charlie@company.example",
          role: "COLLECTOR",
        },
        isLoading: false,
        isAuthenticated: true,
      });
      vi.mocked(settingsApi.getCollectionPolicy).mockResolvedValue(mockPolicy);

      renderWithClient(<SettingsPage />);

      const policyTab = screen.getByRole("button", { name: /Collection Policies/i });
      fireEvent.click(policyTab);

      await waitFor(() => {
        expect(screen.getByText(/grants read-only visibility/i)).toBeInTheDocument();
      });
      const saveBtn = screen.getByRole("button", { name: /Save Collection Policy/i });
      expect(saveBtn).toBeDisabled();
    });

    it("4. validates collection policy thresholds before submission", async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: true });
      vi.mocked(settingsApi.getCollectionPolicy).mockResolvedValue(mockPolicy);

      renderWithClient(<SettingsPage />);

      const policyTab = screen.getByRole("button", { name: /Collection Policies/i });
      await userEvent.click(policyTab);

      const followupInput = await screen.findByLabelText("Follow-up Reminder");
      await userEvent.clear(followupInput);
      await userEvent.type(followupInput, "1"); // follow-up <= initial (1)

      const saveBtn = screen.getByRole("button", { name: /Save Collection Policy/i });
      await userEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText(/Follow-up cadence must be strictly greater than initial reminder days/i)).toBeInTheDocument();
      });
      expect(settingsApi.updateCollectionPolicy).not.toHaveBeenCalled();
    });
  });

  // --- NOTIFICATION CENTER TESTS ---
  describe("Notification Center", () => {
    it("5. renders demo notifications and unread badge in demo mode", async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: true });
      vi.mocked(settingsApi.listNotifications).mockResolvedValue(mockNotifications);

      renderWithClient(<NotificationCenter />);

      const triggerBtn = await screen.findByRole("button", { name: /Notifications/i });
      expect(triggerBtn).toBeInTheDocument();

      // Wait for query to resolve unreadCount
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Notifications \(1 unread\)/i })).toBeInTheDocument();
      });

      await userEvent.click(triggerBtn);

      expect(screen.getByText("Notifications")).toBeInTheDocument();
      expect(screen.getByText("Demo Simulation")).toBeInTheDocument();
      expect(screen.getByText("Invoice #INV-2026-001 Overdue")).toBeInTheDocument();
      expect(screen.getByText("New Payment Receipt")).toBeInTheDocument();
    });

    it("6. marks demo notification as read and triggers mark-all-read action", async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: true });
      vi.mocked(settingsApi.listNotifications).mockResolvedValue(mockNotifications);
      vi.mocked(settingsApi.markAllNotificationsRead).mockResolvedValue(
        mockNotifications.map((n) => ({ ...n, read: true }))
      );

      renderWithClient(<NotificationCenter />);

      const triggerBtn = await screen.findByRole("button", { name: /Notifications/i });
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Notifications \(1 unread\)/i })).toBeInTheDocument();
      });

      await userEvent.click(triggerBtn);

      const markAllBtn = screen.getByRole("button", { name: /Mark all as read/i });
      await userEvent.click(markAllBtn);

      expect(settingsApi.markAllNotificationsRead).toHaveBeenCalledWith(true);
    });

    it("7. live mode clearly indicates that live notification service is unavailable without fabricating events", async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: false });

      renderWithClient(<NotificationCenter />);

      const triggerBtn = screen.getByRole("button", { name: /Notifications \(0 unread\)/i });
      await userEvent.click(triggerBtn);

      expect(screen.getByText("Live Notification Service Unavailable")).toBeInTheDocument();
      expect(screen.getByText(/Global notification streams are not yet implemented/i)).toBeInTheDocument();
      expect(screen.queryByText("Invoice #INV-2026-001 Overdue")).not.toBeInTheDocument();
      expect(settingsApi.listNotifications).not.toHaveBeenCalled();
    });
  });

  // --- ACTIVITY & AUDIT LOG TESTS ---
  describe("Activity & Audit Log", () => {
    it("8. renders demo audit timeline and filters events by type and search", async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: true });
      vi.mocked(settingsApi.listAuditEvents).mockResolvedValue(mockAuditEvents);

      renderWithClient(<AuditLogPage />);

      expect(screen.getByText("Activity & Audit History")).toBeInTheDocument();
      expect(screen.getByText("Demo Mode Only")).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText(/Allocated 1,500.00 INR payment receipt TRX-829103/i)).toBeInTheDocument();
        expect(screen.getByText(/Inbound customer inquiry flagged potential billing discrepancy/i)).toBeInTheDocument();
      });

      // Filter by search
      const searchInput = screen.getByLabelText("Search audit events");
      await userEvent.type(searchInput, "Alice Admin");

      expect(screen.getByText(/Allocated 1,500.00 INR payment receipt TRX-829103/i)).toBeInTheDocument();
      expect(screen.queryByText(/Inbound customer inquiry flagged potential billing discrepancy/i)).not.toBeInTheDocument();
    });

    it("9. live mode clearly labels global audit log as unavailable and directs users to invoice timelines", async () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: false });

      renderWithClient(<AuditLogPage />);

      expect(screen.getByText("Live Organization")).toBeInTheDocument();
      expect(screen.getByText("Global Audit Log Unavailable in Live Mode")).toBeInTheDocument();
      expect(screen.getByText(/The FastAPI backend currently maintains chronological collection history strictly on a per-invoice basis/i)).toBeInTheDocument();

      // Does not call mock store or fabricate live records
      expect(settingsApi.listAuditEvents).not.toHaveBeenCalled();
      expect(screen.queryByText(/Allocated 1,500.00 INR payment receipt TRX-829103/i)).not.toBeInTheDocument();
    });
  });
});
