export type AgingBucket = "NOT_DUE" | "1_30" | "31_60" | "61_90" | "90_PLUS";

export interface InvoiceBalanceResponse {
  invoice_id: string;
  customer_id: string;
  invoice_number: string;
  currency: string;
  total_amount: number | string;
  paid_amount: number | string;
  outstanding_amount: number | string;
  days_overdue: number;
  payment_status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  aging_bucket: AgingBucket;
}

export interface ReceivablesSummary {
  currency: string;
  invoices_count: number;
  total_issued_amount: number | string;
  total_allocated_amount: number | string;
  total_outstanding_amount: number | string;
  overdue_invoices_count: number;
  total_overdue_amount: number | string;
}

export interface AgingBucketTotal {
  bucket: AgingBucket;
  outstanding_invoices_count: number;
  outstanding_amount: number | string;
}

export interface AgingReportResponse {
  currency: string;
  buckets: AgingBucketTotal[];
}
