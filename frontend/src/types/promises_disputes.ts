export type PromiseStatus = "ACTIVE" | "FULFILLED" | "MISSED" | "CANCELLED";

export type DisputeCategory =
  | "INCORRECT_AMOUNT"
  | "DUPLICATE_INVOICE"
  | "SERVICE_OR_PRODUCT_ISSUE"
  | "TAX_OR_BILLING_ISSUE"
  | "PAYMENT_ALREADY_MADE"
  | "OTHER"
  // Legacy / UI aliases
  | "MISSING_GOODS"
  | "DAMAGED_GOODS"
  | "WRONG_AMOUNT"
  | "ALREADY_PAID";

export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";

export interface PaymentPromise {
  id: string;
  invoice_id: string;
  customer_id?: string;
  promised_amount: number | string;
  expected_payment_date: string; // YYYY-MM-DD
  follow_up_date?: string; // YYYY-MM-DD
  status: PromiseStatus;
  notes: string | null;
  currency?: string; // Denominated in invoice currency
  recorded_by_user_id?: string | null;
  source_message_id?: string | null;
  reply_analysis_id?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
}

export interface PromiseCreate {
  promised_amount: number | string;
  expected_payment_date: string;
  follow_up_date?: string;
  notes?: string | null;
  reply_analysis_id?: string;
  source_message_id?: string;
}

export interface PromiseCancel {
  cancellation_reason: string;
}

export interface Dispute {
  id: string;
  invoice_id: string;
  customer_id?: string;
  category: DisputeCategory;
  description: string;
  status: DisputeStatus;
  opened_by_user_id?: string | null;
  resolved_by_user_id?: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface DisputeCreate {
  category: DisputeCategory;
  description: string;
}

export interface DisputeResolve {
  resolution_notes: string;
  status?: "RESOLVED" | "REJECTED"; // Compatibility with legacy call sites
}

export interface DisputeReject {
  rejection_reason: string;
}

