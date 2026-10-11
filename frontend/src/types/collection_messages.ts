export type MessageDirection = "OUTBOUND" | "INBOUND" | "INTERNAL_NOTE";
export type MessageChannel = "EMAIL" | "SMS" | "WHATSAPP" | "PORTAL" | "PHONE" | "INTERNAL";
export type MessageStatus = "DRAFT" | "PENDING_REVIEW" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED" | "SENT" | "DELIVERED" | "FAILED" | "RECEIVED" | "RECORDED";
export type EventType = "COMMUNICATION" | "STATUS_CHANGE" | "PAYMENT" | "PROMISE" | "DISPUTE" | "NOTE";

export interface CollectionMessage {
  id: string;
  invoice_id?: string | null;
  customer_id?: string | null;
  direction: MessageDirection;
  channel: MessageChannel;
  status: MessageStatus;
  subject: string | null;
  body: string;
  sent_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface MessageCreate {
  direction: MessageDirection;
  channel: MessageChannel;
  subject?: string | null;
  body: string;
  status?: MessageStatus;
}

export interface TimelineEvent {
  event_type: EventType | string;
  description: string;
  actor_user_id?: string | null;
  created_at?: string;
  id?: string;
  title?: string;
  occurred_at?: string;
  metadata?: Record<string, unknown> | null;
}
