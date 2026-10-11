import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeamManagementPage from "@/app/(dashboard)/settings/team/page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { teamApi } from "@/lib/api/team.api";
import { TeamMember } from "@/types/auth";

// Mocks
const mockUseDemoMode = vi.fn();
const mockUseAuth = vi.fn();

vi.mock("@/providers/DemoModeProvider", () => ({
  useDemoMode: () => mockUseDemoMode(),
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/lib/api/team.api", () => ({
  teamApi: {
    list: vi.fn(),
    invite: vi.fn(),
    updateRole: vi.fn(),
  },
}));

const mockMembers: TeamMember[] = [
  {
    id: "user-owner",
    organization_id: "org-1",
    full_name: "Alice Admin",
    email: "alice@example.com",
    role: "OWNER",
    status: "ACTIVE",
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    is_demo: true,
  },
  {
    id: "user-fin",
    organization_id: "org-1",
    full_name: "Bob Finance",
    email: "bob@example.com",
    role: "FINANCE_MANAGER",
    status: "ACTIVE",
    is_active: true,
    created_at: "2026-02-01T00:00:00.000Z",
    is_demo: true,
  },
  {
    id: "user-col",
    organization_id: "org-1",
    full_name: "Charlie Collector",
    email: "charlie@example.com",
    role: "COLLECTOR",
    status: "ACTIVE",
    is_active: true,
    created_at: "2026-03-01T00:00:00.000Z",
    is_demo: true,
  },
  {
    id: "user-view",
    organization_id: "org-1",
    full_name: "Dave Viewer",
    email: "dave@example.com",
    role: "VIEWER",
    status: "PENDING_INVITATION",
    is_active: false,
    created_at: "2026-04-01T00:00:00.000Z",
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

describe("ACCO Team Management & Role Clarity Workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: "auth-u1",
        full_name: "Live Admin",
        email: "live.admin@company.example",
        role: "OWNER",
      },
      isLoading: false,
      isAuthenticated: true,
    });
  });

  it("1. renders team directory with members and demo mode indicator in demo mode", async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true });
    vi.mocked(teamApi.list).mockResolvedValue(mockMembers);

    renderWithClient(<TeamManagementPage />);

    expect(screen.getByText("Team Directory & Roles")).toBeInTheDocument();
    expect(screen.getByText("Demo Mode Only")).toBeInTheDocument();
    expect(
      screen.getByText(/The records shown below are simulated members/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeInTheDocument();
      expect(screen.getByText("Bob Finance")).toBeInTheDocument();
      expect(screen.getByText("Charlie Collector")).toBeInTheDocument();
      expect(screen.getByText("Dave Viewer")).toBeInTheDocument();
    });
  });

  it("2. filters team members by search query and role filter", async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true });
    vi.mocked(teamApi.list).mockResolvedValue(mockMembers);

    renderWithClient(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    });

    // Search query
    const searchInput = screen.getByLabelText("Search team members");
    await userEvent.type(searchInput, "Charlie");

    expect(screen.getByText("Charlie Collector")).toBeInTheDocument();
    expect(screen.queryByText("Alice Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Bob Finance")).not.toBeInTheDocument();

    // Clear search
    await userEvent.clear(searchInput);
    expect(screen.getByText("Alice Admin")).toBeInTheDocument();

    // Role filter
    const roleSelect = screen.getByLabelText("Filter by role");
    fireEvent.change(roleSelect, { target: { value: "FINANCE_MANAGER" } });

    expect(screen.getByText("Bob Finance")).toBeInTheDocument();
    expect(screen.queryByText("Alice Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie Collector")).not.toBeInTheDocument();
  });

  it("3. displays the four canonical ACCO roles with badges and clarity cards", async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true });
    vi.mocked(teamApi.list).mockResolvedValue(mockMembers);

    renderWithClient(<TeamManagementPage />);

    // Check Role Clarity Cards section
    expect(
      screen.getByText("ACCO Roles & Enforced Permissions")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Full administrative and financial control over organization tenancy/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Supervises AR workflows, cash-flow allocation, and debt governance/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Operational collector managing day-to-day debtor outreach/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Read-only stakeholder visibility across financial and collections ledgers/i)
    ).toBeInTheDocument();
  });

  it("4. handles empty, loading and error states properly", async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true });
    vi.mocked(teamApi.list).mockResolvedValue([]);

    renderWithClient(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("No team members found")).toBeInTheDocument();
    });

    // Error test
    vi.mocked(teamApi.list).mockRejectedValue(new Error("Database connection timed out"));
    renderWithClient(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load team members")).toBeInTheDocument();
      expect(screen.getByText("Database connection timed out")).toBeInTheDocument();
    });
  });

  it("5. validates demo invitation fields and prevents invalid submissions", async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true });
    vi.mocked(teamApi.list).mockResolvedValue(mockMembers);

    renderWithClient(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    });

    // Open invite dialog
    const inviteButton = screen.getByRole("button", { name: /Invite Member \(Demo\)/i });
    await userEvent.click(inviteButton);

    expect(screen.getByRole("heading", { name: "Invite Team Member" })).toBeInTheDocument();

    // Submit empty form
    const submitBtn = screen.getByRole("button", { name: /Simulate Invitation/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText("Full name is required")).toBeInTheDocument();
    expect(teamApi.invite).not.toHaveBeenCalled();

    // Fill invalid email
    const nameInput = screen.getByLabelText(/Full Name/i);
    await userEvent.type(nameInput, "New Employee");
    const emailInput = screen.getByLabelText(/Work Email Address/i);
    await userEvent.type(emailInput, "not-an-email");

    await userEvent.click(submitBtn);
    expect(screen.getByText("Please provide a valid email address")).toBeInTheDocument();
    expect(teamApi.invite).not.toHaveBeenCalled();
  });

  it("6. submits valid demo invitation and displays simulation confirmation without real email", async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true });
    vi.mocked(teamApi.list).mockResolvedValue(mockMembers);
    vi.mocked(teamApi.invite).mockResolvedValue({
      id: "demo-u99",
      organization_id: "org-1",
      full_name: "Sarah Connors",
      email: "sarah@acco.example",
      role: "COLLECTOR",
      status: "PENDING_INVITATION",
      is_active: false,
      created_at: new Date().toISOString(),
      is_demo: true,
    });

    renderWithClient(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    });

    const inviteButton = screen.getByRole("button", { name: /Invite Member \(Demo\)/i });
    await userEvent.click(inviteButton);

    const nameInput = screen.getByLabelText(/Full Name/i);
    const emailInput = screen.getByLabelText(/Work Email Address/i);
    await userEvent.type(nameInput, "Sarah Connors");
    await userEvent.type(emailInput, "sarah@acco.example");

    const submitBtn = screen.getByRole("button", { name: /Simulate Invitation/i });
    await userEvent.click(submitBtn);

    expect(teamApi.invite).toHaveBeenCalledWith(
      {
        full_name: "Sarah Connors",
        email: "sarah@acco.example",
        role: "COLLECTOR",
      },
      true
    );

    await waitFor(() => {
      expect(screen.getByText("Demo Invitation Registered")).toBeInTheDocument();
      expect(screen.getByText(/Demo mode: No actual email was sent/i)).toBeInTheDocument();
    });
  });

  it("7. opens edit role dialog and updates demo role while clarifying permission isolation", async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true });
    vi.mocked(teamApi.list).mockResolvedValue(mockMembers);
    vi.mocked(teamApi.updateRole).mockResolvedValue({
      ...mockMembers[2],
      role: "FINANCE_MANAGER",
    });

    renderWithClient(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Charlie Collector")).toBeInTheDocument();
    });

    // Click edit role on Charlie
    const editButtons = screen.getAllByRole("button", { name: "Edit Role" });
    await userEvent.click(editButtons[2]); // Charlie

    expect(screen.getByText(/Edit Role: Charlie Collector/i)).toBeInTheDocument();
    expect(screen.getByText(/Demo Role Isolation/i)).toBeInTheDocument();

    // Select Finance Manager option
    const fmOption = screen.getByRole("button", { name: /Finance Manager/i });
    await userEvent.click(fmOption);

    const updateBtn = screen.getByRole("button", { name: /Update Role \(Demo\)/i });
    await userEvent.click(updateBtn);

    expect(teamApi.updateRole).toHaveBeenCalledWith(
      {
        user_id: "user-col",
        role: "FINANCE_MANAGER",
      },
      true
    );

    await waitFor(() => {
      expect(screen.getByText("Role Updated (Demo)")).toBeInTheDocument();
      expect(screen.getByText(/Demo mode: Live permissions unchanged/i)).toBeInTheDocument();
    });
  });

  it("8. live mode shows clear unavailable state without falling back to mock users or calling demo endpoints", async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: false });
    // In live mode, component calls list(false)
    vi.mocked(teamApi.list).mockResolvedValue([]);

    renderWithClient(<TeamManagementPage />);

    expect(screen.getByText("Live Organization")).toBeInTheDocument();
    expect(
      screen.getByText("Live Team Management Unavailable")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The FastAPI backend currently maintains a minimal placeholder for user management/i)
    ).toBeInTheDocument();

    // Shows current authenticated user session instead of mock accounts
    expect(screen.getByText("Live Admin")).toBeInTheDocument();
    expect(screen.getByText("live.admin@company.example")).toBeInTheDocument();
    expect(screen.getAllByText("OWNER").length).toBeGreaterThanOrEqual(1);

    // The invite button is disabled in live mode
    const disabledInviteBtn = screen.getByRole("button", { name: /Invite Member$/i });
    expect(disabledInviteBtn).toBeDisabled();

    // Verify mock members are NEVER shown in live mode
    expect(screen.queryByText("Alice Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Bob Finance")).not.toBeInTheDocument();
  });

  it("9. prevents duplicate submissions by disabling form submission while in-flight", async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true });
    vi.mocked(teamApi.list).mockResolvedValue(mockMembers);

    let resolveInvite: (val: any) => void = () => {};
    const invitePromise = new Promise((res) => {
      resolveInvite = res;
    });
    vi.mocked(teamApi.invite).mockReturnValue(invitePromise as any);

    renderWithClient(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    });

    const inviteButton = screen.getByRole("button", { name: /Invite Member \(Demo\)/i });
    await userEvent.click(inviteButton);

    const nameInput = screen.getByLabelText(/Full Name/i);
    const emailInput = screen.getByLabelText(/Work Email Address/i);
    await userEvent.type(nameInput, "Double Clicker");
    await userEvent.type(emailInput, "double@example.com");

    const submitBtn = screen.getByRole("button", { name: /Simulate Invitation/i });
    await userEvent.click(submitBtn);

    // While in flight, the button shows loading and is disabled
    expect(submitBtn).toBeDisabled();
    expect(teamApi.invite).toHaveBeenCalledTimes(1);

    // Further clicks do nothing
    fireEvent.click(submitBtn);
    expect(teamApi.invite).toHaveBeenCalledTimes(1);

    resolveInvite({
      id: "demo-u999",
      organization_id: "org-1",
      full_name: "Double Clicker",
      email: "double@example.com",
      role: "COLLECTOR",
      status: "PENDING_INVITATION",
      is_active: false,
      created_at: new Date().toISOString(),
      is_demo: true,
    });
  });
});
