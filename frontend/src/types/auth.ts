export type UserRole = "OWNER" | "ADMIN" | "FINANCE_MANAGER" | "COLLECTOR" | "VIEWER";

export type TeamMemberStatus = "ACTIVE" | "PENDING_INVITATION" | "INACTIVE";

export interface User {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role: UserRole;
  created_at: string;
}

export interface TeamMember {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: TeamMemberStatus;
  is_active: boolean;
  invited_at?: string;
  created_at: string;
  is_demo?: boolean;
}

export interface TeamInviteRequest {
  email: string;
  full_name: string;
  role: UserRole;
}

export interface TeamRoleUpdateRequest {
  user_id: string;
  role: UserRole;
}

export interface RegisterRequest {
  organization_name: string;
  organization_slug: string;
  full_name: string;
  email: string;
  password?: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

