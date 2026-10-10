export type PaymentMethod = "BANK_TRANSFER" | "CASH" | "CHEQUE" | "CARD" | "ONLINE" | "OTHER";

export interface PaymentCreate {
  customer_id: string;
  amount: number | string;
  currency: string;
  payment_date: string; // YYYY-MM-DD
  payment_method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
}

export interface PaymentAllocationCreate {
  invoice_id: string;
  amount: number | string;
}

export interface PaymentReversalCreate {
  reason: string;
}

export interface PaymentAllocationResponse {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount: number;
  created_at: string;
}

export interface PaymentReversalResponse {
  id: string;
  reason: string;
  reversed_at: string;
}

export interface PaymentResponse {
  id: string;
  organization_id: string;
  customer_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  created_at: string;
  
  allocated_amount: number;
  unallocated_amount: number;
  
  allocations: PaymentAllocationResponse[];
  reversal: PaymentReversalResponse | null;
}
