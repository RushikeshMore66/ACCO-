export type PromiseStatus = "ACTIVE" | "FULFILLED" | "MISSED" | "CANCELLED";
export type DisputeCategory = "MISSING_GOODS" | "DAMAGED_GOODS" | "WRONG_AMOUNT" | "ALREADY_PAID" | "OTHER";
export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";

export interface PaymentPromise {
  id: string;
  invoice_id: string;
  promised_amount: number | string;
  expected_payment_date: string; // YYYY-MM-DD
  status: PromiseStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  currency?: string; // Implicit from invoice, sometimes included in response
}

export interface PromiseCreate {
  promised_amount: number | string;
  expected_payment_date: string;
  follow_up_date?: string;
  notes?: string | null;
  reply_analysis_id?: string;
  source_message_id?: string;
}

export interface Dispute {
  id: string;
  invoice_id: string;
  category: DisputeCategory;
  description: string;
  status: DisputeStatus;
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
  status: "RESOLVED" | "REJECTED";
  resolution_notes: string;
}
