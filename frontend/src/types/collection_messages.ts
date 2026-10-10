export type MessageDirection = "OUTBOUND" | "INBOUND";
export type MessageChannel = "EMAIL" | "SMS" | "WHATSAPP" | "PORTAL";
export type MessageStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SENT" | "DELIVERED" | "FAILED";
export type EventType = "COMMUNICATION" | "STATUS_CHANGE" | "PAYMENT" | "PROMISE" | "DISPUTE" | "NOTE";

export interface CollectionMessage {
  id: string;
  invoice_id: string;
  direction: MessageDirection;
  channel: MessageChannel;
  status: MessageStatus;
  subject: string | null;
  body: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageCreate {
  direction: MessageDirection;
  channel: MessageChannel;
  subject?: string | null;
  body: string;
  status?: MessageStatus;
}

export interface TimelineEvent {
  id: string;
  event_type: EventType;
  title: string;
  description: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}
