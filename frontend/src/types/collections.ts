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
