export interface ReceivableItem {
  invoice_id: string;
  customer_name: string;
  invoice_number: string;
  currency: string;
  total_amount: number | string;
  outstanding_amount: number | string;
  issue_date: string;
  due_date: string;
  days_overdue: number;
  collection_stage: string;
  recommended_action: string;
}

export interface CollectionPolicy {
  id?: string;
  organization_id?: string;
  initial_reminder_after_days: number;
  follow_up_after_days: number;
  escalation_after_days: number;
  require_approval_before_send: boolean;
  pause_collection_on_dispute: boolean;
  pause_collection_on_payment_promise: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CollectionPolicyUpdate {
  initial_reminder_after_days: number;
  follow_up_after_days: number;
  escalation_after_days: number;
  require_approval_before_send: boolean;
  pause_collection_on_dispute: boolean;
  pause_collection_on_payment_promise: boolean;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  slug: string;
  base_currency: string;
  tax_identifier?: string;
  is_active: boolean;
  created_at: string;
}

export interface OrganizationSettingsUpdate {
  name: string;
  base_currency: string;
  tax_identifier?: string;
}

export interface AppNotification {
  id: string;
  type:
    | "INVOICE_OVERDUE"
    | "PROMISE_APPROACHING"
    | "PROMISE_MISSED"
    | "CUSTOMER_REPLY"
    | "PAYMENT_RECORDED"
    | "DISPUTE_OPENED";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  href?: string;
  meta?: {
    invoice_id?: string;
    customer_id?: string;
    payment_id?: string;
    dispute_id?: string;
  };
}

export interface AuditEvent {
  id: string;
  event_type: string;
  actor: string;
  target?: string;
  target_id?: string;
  description: string;
  created_at: string;
  is_demo?: boolean;
}

