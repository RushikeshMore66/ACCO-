export type CanonicalInvoiceStatus = "DRAFT" | "ISSUED" | "VOID";

export type InvoiceStatus =
  | "DRAFT"
  | "ISSUED"
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "OVERDUE"
  | "PAID"
  | "VOID"
  | "CANCELLED";

export interface Invoice {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  total_amount: string | number;
  description: string | null;
  status: InvoiceStatus;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
}

export interface InvoiceCreate {
  customer_id: string;
  invoice_number: string;
  issue_date: string; // ISO format string
  due_date: string;   // ISO format string
  currency: string;
  total_amount: number | string;
  description?: string | null;
}

export interface InvoiceUpdate {
  customer_id?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  currency?: string | null;
  total_amount?: number | string | null;
  description?: string | null;
}

export interface InvoiceVoid {
  void_reason: string;
}
