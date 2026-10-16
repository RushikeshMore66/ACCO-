import { TeamMember, TeamInviteRequest, TeamRoleUpdateRequest } from "@/types/auth";
import { apiClient, isDemoMode } from "./client";
import { mockStore } from "../mock/mock-store";

/**
 * Team and User Management API client.
 *
 * BACKEND STATUS:
 * The FastAPI backend currently maintains a minimal placeholder endpoint for users
 * (`/api/v1/users`), without organization user directories, invitations, or role update endpoints.
 *
 * DEMO/LIVE BOUNDARIES:
 * - When in demo mode (`isDemoMode` or simulated context), operations read/write to the isolated in-memory `mockStore`.
 * - When in live mode, attempts to perform user operations communicate strictly with the authenticated backend.
 * - If the backend returns 404 or fails, the client NEVER silently falls back to mock mutations.
 * - Live users and demo users are completely separate.
 */
export const teamApi = {
  /**
   * List all team members within the active organization.
   * If in demo mode, returns simulated demo members with `is_demo: true`.
   * If in live mode, calls `/team` via BFF proxy. If unavailable, surfaces the error.
   */
  async list(useDemo: boolean = isDemoMode): Promise<TeamMember[]> {
    if (useDemo) {
      return mockStore.listTeamMembers();
    }
    return apiClient<TeamMember[]>("/team");
  },

  /**
   * Invite a new team member.
   * Only permitted in demo mode as simulated invitation.
   * In live mode, calls `/team/invites` which is currently not supported by backend.
   */
  async invite(data: TeamInviteRequest, useDemo: boolean = isDemoMode): Promise<TeamMember> {
    if (useDemo) {
      return mockStore.inviteTeamMember(data);
    }
    return apiClient<TeamMember>("/team/invites", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a team member's role.
   * Only permitted in demo mode as simulated update.
   * In live mode, calls `/team/${user_id}/role` which is currently not supported by backend.
   */
  async updateRole(data: TeamRoleUpdateRequest, useDemo: boolean = isDemoMode): Promise<TeamMember> {
    if (useDemo) {
      return mockStore.updateTeamMemberRole(data);
    }
    return apiClient<TeamMember>(`/team/${data.user_id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: data.role }),
    });
  },
};
