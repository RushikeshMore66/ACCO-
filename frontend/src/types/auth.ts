export type UserRole = "OWNER" | "FINANCE_MANAGER" | "COLLECTOR" | "VIEWER";

export interface User {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role: UserRole;
  created_at: string;
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
