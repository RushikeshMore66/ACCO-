export type ReplyClassification = "PAYMENT_PROMISE" | "PAYMENT_CLAIM" | "DISPUTE" | "INVOICE_COPY_REQUEST" | "PAYMENT_PLAN_REQUEST" | "NEED_MORE_INFORMATION" | "PAYMENT_REFUSAL" | "GENERAL_REPLY" | "AUTOMATED_REPLY" | "BOUNCE_OR_DELIVERY_NOTICE";
export type AnalysisStatus = "PENDING_REVIEW" | "ACCEPTED" | "DISMISSED";

export interface LLMExtractionResult {
  primary_classification: ReplyClassification;
  secondary_classifications: ReplyClassification[];
  evidence_summary: string;
  customer_intent: string;
  explicit_payment_amount: number | string | null;
  currency: string | null;
  proposed_payment_date: string | null;
  claims_already_paid: boolean;
  dispute_category: string | null;
  requests_information: boolean;
  missing_information: string | null;
  recommended_next_action: string;
  requires_human_review: boolean;
  confidence_score: number;
}

export interface CustomerReplyAnalysis {
  id: string;
  organization_id: string;
  source_message_id: string;
  invoice_id: string | null;
  customer_id: string;
  classification: ReplyClassification;
  confidence_score: number;
  analysis_payload: LLMExtractionResult;
  model_provider: string;
  model_name: string;
  prompt_version: string;
  status: AnalysisStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReplyAnalysisReviewRequest {
  status: "ACCEPTED" | "DISMISSED";
  notes?: string | null;
}
