from enum import Enum


class AgingBucket(str, Enum):
    CURRENT = "current"
    DAYS_1_30 = "1-30"
    DAYS_31_60 = "31-60"
    DAYS_61_90 = "61-90"
    DAYS_90_PLUS = "90+"


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    DISPUTED = "disputed"
    WRITTEN_OFF = "written_off"


class CollectionCaseStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    PROMISED_TO_PAY = "promised_to_pay"
    ESCALATED = "escalated"
    PAUSED = "paused"
    RESOLVED = "resolved"
    CLOSED = "closed"


class CommunicationChannel(str, Enum):
    EMAIL = "email"
    SMS = "sms"
    PHONE = "phone"
    POSTAL_MAIL = "postal_mail"


class ActionApprovalStatus(str, Enum):
    AUTO_APPROVED = "auto_approved"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"


DEFAULT_CURRENCY = "USD"
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
