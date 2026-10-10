import { Badge } from "@/components/ui/Badge";

// Invoice statuses from backend InvoiceStatus enum
type InvoiceStatus =
  | "DRAFT"
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "OVERDUE"
  | "PAID"
  | "VOID"
  | "CANCELLED";

// Promise statuses from backend PromiseStatus enum
type PromiseStatus = "ACTIVE" | "FULFILLED" | "MISSED" | "CANCELLED";

// Dispute statuses from backend DisputeStatus enum
type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";

// Analysis statuses from backend AnalysisStatus enum
type AnalysisStatus = "PENDING" | "ACCEPTED" | "DISMISSED";

// Message statuses
type MessageStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SENT"
  | "DELIVERED"
  | "FAILED";

// Collection stages
type CollectionStage =
  | "EARLY_OVERDUE"
  | "FOLLOW_UP"
  | "ESCALATION_REVIEW"
  | "PROMISE_PENDING"
  | "DISPUTE_REVIEW"
  | string;

type UserRole = "OWNER" | "FINANCE_MANAGER" | "COLLECTOR" | "VIEWER";

const invoiceStatusConfig: Record<
  InvoiceStatus,
  { label: string; variant: "success" | "warning" | "error" | "info" | "muted" | "purple" | "default" }
> = {
  DRAFT: { label: "Draft", variant: "muted" },
  UNPAID: { label: "Unpaid", variant: "info" },
  PARTIALLY_PAID: { label: "Partial", variant: "warning" },
  OVERDUE: { label: "Overdue", variant: "error" },
  PAID: { label: "Paid", variant: "success" },
  VOID: { label: "Void", variant: "muted" },
  CANCELLED: { label: "Cancelled", variant: "muted" },
};

const promiseStatusConfig: Record<
  PromiseStatus,
  { label: string; variant: "success" | "warning" | "error" | "info" | "muted" | "purple" | "default" }
> = {
  ACTIVE: { label: "Active", variant: "info" },
  FULFILLED: { label: "Fulfilled", variant: "success" },
  MISSED: { label: "Missed", variant: "error" },
  CANCELLED: { label: "Cancelled", variant: "muted" },
};

const disputeStatusConfig: Record<
  DisputeStatus,
  { label: string; variant: "success" | "warning" | "error" | "info" | "muted" | "purple" | "default" }
> = {
  OPEN: { label: "Open", variant: "error" },
  UNDER_REVIEW: { label: "Under Review", variant: "warning" },
  RESOLVED: { label: "Resolved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "muted" },
};

const analysisStatusConfig: Record<
  AnalysisStatus,
  { label: string; variant: "success" | "warning" | "error" | "info" | "muted" | "purple" | "default" }
> = {
  PENDING: { label: "Pending Review", variant: "warning" },
  ACCEPTED: { label: "Accepted", variant: "success" },
  DISMISSED: { label: "Dismissed", variant: "muted" },
};

const roleConfig: Record<
  UserRole,
  { label: string; variant: "success" | "warning" | "error" | "info" | "muted" | "purple" | "default" }
> = {
  OWNER: { label: "Owner", variant: "purple" },
  FINANCE_MANAGER: { label: "Finance Manager", variant: "info" },
  COLLECTOR: { label: "Collector", variant: "default" },
  VIEWER: { label: "Viewer", variant: "muted" },
};

interface StatusBadgeProps {
  type: "invoice" | "promise" | "dispute" | "analysis" | "role" | "collection";
  status: string;
  dot?: boolean;
}

export function StatusBadge({ type, status, dot = false }: StatusBadgeProps) {
  let config: { label: string; variant: "success" | "warning" | "error" | "info" | "muted" | "purple" | "default" } | undefined;

  switch (type) {
    case "invoice":
      config = invoiceStatusConfig[status as InvoiceStatus];
      break;
    case "promise":
      config = promiseStatusConfig[status as PromiseStatus];
      break;
    case "dispute":
      config = disputeStatusConfig[status as DisputeStatus];
      break;
    case "analysis":
      config = analysisStatusConfig[status as AnalysisStatus];
      break;
    case "role":
      config = roleConfig[status as UserRole];
      break;
    case "collection":
      // Collection stages — map to sensible badges
      config = {
        EARLY_OVERDUE: { label: "Early Overdue", variant: "warning" as const },
        FOLLOW_UP: { label: "Follow-Up", variant: "info" as const },
        ESCALATION_REVIEW: { label: "Escalation", variant: "error" as const },
        PROMISE_PENDING: { label: "Promise Pending", variant: "purple" as const },
        DISPUTE_REVIEW: { label: "Dispute Review", variant: "error" as const },
      }[status] ?? { label: status, variant: "default" as const };
      break;
  }

  if (!config) {
    config = { label: status, variant: "default" };
  }

  return (
    <Badge variant={config.variant} dot={dot}>
      {config.label}
    </Badge>
  );
}
