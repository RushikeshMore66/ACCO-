"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDemoMode } from "@/providers/DemoModeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { teamApi } from "@/lib/api/team.api";
import { TeamMember, UserRole, TeamInviteRequest, TeamRoleUpdateRequest } from "@/types/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { RoleBadge } from "@/components/team/RoleBadge";
import { RoleClarityCards } from "@/components/team/RoleClarityCards";
import { DemoInviteMemberDialog } from "@/components/team/DemoInviteMemberDialog";
import { DemoEditRoleDialog } from "@/components/team/DemoEditRoleDialog";
import { formatDateShort } from "@/lib/formatting/dates";
import {
  Users,
  Plus,
  Search,
  Filter,
  UserCog,
  AlertTriangle,
  RefreshCw,
  Info,
  Shield,
  CheckCircle,
  Clock,
  Ban,
  UserCheck,
} from "lucide-react";

type RoleFilterOption = "ALL" | UserRole;
type SortOption = "name_asc" | "name_desc" | "date_desc" | "date_asc";

export default function TeamManagementPage() {
  const { isDemoMode } = useDemoMode();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // Search, filter, and sorting
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilterOption>("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("name_asc");

  // Dialog states
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // Queries
  const {
    data: members = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["teamMembers", { isDemoMode }],
    queryFn: () => teamApi.list(isDemoMode),
  });

  // Demo Mutations
  const inviteMutation = useMutation({
    mutationFn: (data: TeamInviteRequest) => teamApi.invite(data, isDemoMode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: (data: TeamRoleUpdateRequest) => teamApi.updateRole(data, isDemoMode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
    },
  });

  // Filtered & sorted members
  const filteredMembers = useMemo(() => {
    let result = [...members];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (m) =>
          m.full_name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
      );
    }

    if (roleFilter !== "ALL") {
      result = result.filter((m) => m.role === roleFilter);
    }

    result.sort((a, b) => {
      switch (sortOption) {
        case "name_asc":
          return a.full_name.localeCompare(b.full_name);
        case "name_desc":
          return b.full_name.localeCompare(a.full_name);
        case "date_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "date_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [members, searchTerm, roleFilter, sortOption]);

  const handleInviteSubmit = async (data: TeamInviteRequest) => {
    await inviteMutation.mutateAsync(data);
  };

  const handleUpdateRoleSubmit = async (data: TeamRoleUpdateRequest) => {
    await updateRoleMutation.mutateAsync(data);
  };

  return (
    <div className="flex flex-col h-full bg-surface p-6 overflow-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-text-primary">
              Team Directory & Roles
            </h1>
            {isDemoMode ? (
              <Badge variant="warning" className="gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-status-warning shrink-0" />
                Demo Mode Only
              </Badge>
            ) : (
              <Badge variant="purple" className="gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                Live Organization
              </Badge>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Manage organization users, inspect role boundaries, and review access governance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isDemoMode ? (
            <Button
              variant="primary"
              onClick={() => setIsInviteOpen(true)}
              className="gap-1.5"
            >
              <Plus size={16} />
              <span>Invite Member (Demo)</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled
              title="Invitation endpoint is currently unavailable on the backend"
              className="opacity-60 cursor-not-allowed"
            >
              <Plus size={16} className="mr-1.5" />
              <span>Invite Member</span>
            </Button>
          )}
        </div>
      </div>

      {/* Demo Mode Notice Banner if in demo mode */}
      {isDemoMode && (
        <div className="p-4 bg-status-warning-bg/40 border border-status-warning/30 rounded-xl flex items-start gap-3">
          <Info size={18} className="text-status-warning shrink-0 mt-0.5" />
          <div className="text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold text-text-primary">Simulated Directory (Demo Mode Active): </span>
            The records shown below are simulated members stored in isolated local memory.
            Modifications and simulated invites do not create backend accounts or alter actual authentication privileges.
          </div>
        </div>
      )}

      {/* Live Mode Unavailable State or Live Table */}
      {!isDemoMode ? (
        <div className="bg-white rounded-xl border border-surface-border shadow-sm p-8 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-surface border border-surface-border flex items-center justify-center text-text-muted mb-4">
            <UserCog size={24} />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Live Team Management Unavailable
          </h3>
          <p className="text-sm text-text-secondary max-w-md leading-relaxed mb-4">
            The FastAPI backend currently maintains a minimal placeholder for user management
            (<code className="px-1.5 py-0.5 bg-surface rounded text-text-primary font-mono text-xs">/api/v1/users</code>).
            Organization directory listing, invitation issuance, and live role modification endpoints are awaiting the domain milestone.
          </p>
          <div className="p-3 bg-surface border border-surface-border rounded-lg max-w-md w-full text-left text-xs space-y-1.5 text-text-secondary mb-5">
            <div className="font-medium text-text-primary">Current Session Identity:</div>
            <div>
              <span className="text-text-muted">Authenticated User: </span>
              <span className="font-medium text-text-primary">{currentUser?.full_name ?? "Signed In"}</span>
            </div>
            <div>
              <span className="text-text-muted">Email: </span>
              <span className="font-mono text-text-primary">{currentUser?.email ?? "—"}</span>
            </div>
            <div>
              <span className="text-text-muted">Authoritative Backend Role: </span>
              <span className="font-semibold text-brand">{currentUser?.role ?? "UNKNOWN"}</span>
            </div>
          </div>
          <p className="text-xs text-text-muted">
            To preview team directory interfaces, invitation validation, and role workflows, switch to <strong>Demo Mode</strong> in your environment or top-bar control.
          </p>
        </div>
      ) : (
        /* Team Directory Card */
        <div className="bg-white rounded-xl border border-surface-border shadow-sm overflow-hidden flex flex-col">
          {/* Filter Bar */}
          <div className="p-4 border-b border-surface-border bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search team members by name or email…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-surface-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                aria-label="Search team members"
              />
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Filter size={14} className="text-text-muted" />
                <span className="hidden sm:inline">Role:</span>
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilterOption)}
                className="h-9 px-2.5 rounded-lg border border-surface-border bg-white text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-brand"
                aria-label="Filter by role"
              >
                <option value="ALL">All Roles ({members.length})</option>
                <option value="OWNER">Owner</option>
                <option value="FINANCE_MANAGER">Finance Manager</option>
                <option value="COLLECTOR">Collector</option>
                <option value="VIEWER">Viewer</option>
              </select>

              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="h-9 px-2.5 rounded-lg border border-surface-border bg-white text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-brand"
                aria-label="Sort directory"
              >
                <option value="name_asc">Name (A-Z)</option>
                <option value="name_desc">Name (Z-A)</option>
                <option value="date_desc">Newest Added</option>
                <option value="date_asc">Oldest Added</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                isLoading={isFetching}
                title="Refresh team directory"
                className="h-9 px-2.5"
              >
                <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
              </Button>
            </div>
          </div>

          {/* Error State */}
          {isError && (
            <div className="p-6 text-center">
              <div className="w-10 h-10 rounded-full bg-status-error-bg text-status-error mx-auto flex items-center justify-center mb-2">
                <AlertTriangle size={20} />
              </div>
              <p className="text-sm font-medium text-text-primary mb-1">
                Unable to load team members
              </p>
              <p className="text-xs text-text-secondary mb-3">
                {error instanceof Error ? error.message : "An unexpected error occurred"}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          {/* Loading Skeleton */}
          {isLoading && (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <Skeleton className="w-9 h-9 rounded-full" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !isError && filteredMembers.length === 0 && (
            <div className="p-8">
              <EmptyState
                icon={Users}
                title="No team members found"
                description={
                  searchTerm || roleFilter !== "ALL"
                    ? "No members matched your search or role filters. Try adjusting your filter parameters."
                    : "There are currently no members in the directory."
                }
                action={
                  searchTerm || roleFilter !== "ALL"
                    ? {
                        label: "Clear Filters",
                        onClick: () => {
                          setSearchTerm("");
                          setRoleFilter("ALL");
                        },
                      }
                    : {
                        label: "Invite First Member",
                        onClick: () => setIsInviteOpen(true),
                      }
                }
              />
            </div>
          )}

          {/* Directory Table */}
          {!isLoading && !isError && filteredMembers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-border bg-surface/60 text-2xs font-semibold text-text-secondary uppercase tracking-wider">
                    <th className="px-5 py-3 font-medium">Team Member</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Date Added</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border text-sm">
                  {filteredMembers.map((member) => {
                    const initials = member.full_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2);

                    return (
                      <tr
                        key={member.id}
                        className="hover:bg-surface/40 transition-colors"
                      >
                        {/* Member Identity */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-text-primary flex items-center gap-2 truncate">
                                <span>{member.full_name}</span>
                                {member.is_demo && (
                                  <span className="text-[10px] text-text-muted bg-surface px-1 rounded border border-surface-border">
                                    demo
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-text-secondary truncate">
                                {member.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-5 py-3.5">
                          <RoleBadge role={member.role} />
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          {member.status === "ACTIVE" ? (
                            <Badge variant="success" dot className="capitalize">
                              Active
                            </Badge>
                          ) : member.status === "PENDING_INVITATION" ? (
                            <Badge variant="warning" dot className="capitalize">
                              Pending Invitation
                            </Badge>
                          ) : (
                            <Badge variant="muted" dot className="capitalize">
                              Inactive
                            </Badge>
                          )}
                        </td>

                        {/* Date Added */}
                        <td className="px-5 py-3.5 text-xs text-text-secondary">
                          {formatDateShort(member.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingMember(member)}
                            className="text-xs h-8"
                          >
                            Edit Role
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Directory Summary Footer */}
          {!isLoading && !isError && filteredMembers.length > 0 && (
            <div className="px-5 py-3 border-t border-surface-border bg-surface/30 flex items-center justify-between text-xs text-text-secondary">
              <div>
                Showing <span className="font-semibold text-text-primary">{filteredMembers.length}</span> of{" "}
                <span className="font-semibold text-text-primary">{members.length}</span> members
              </div>
              <div className="flex items-center gap-4 text-2xs text-text-muted">
                <span>Demo In-Memory Directory</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Role Clarity Section */}
      <RoleClarityCards />

      {/* Demo Invite Dialog */}
      <DemoInviteMemberDialog
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
        onInvite={handleInviteSubmit}
      />

      {/* Demo Edit Role Dialog */}
      <DemoEditRoleDialog
        member={editingMember}
        open={editingMember !== null}
        onOpenChange={(open) => {
          if (!open) setEditingMember(null);
        }}
        onUpdateRole={handleUpdateRoleSubmit}
      />
    </div>
  );
}
