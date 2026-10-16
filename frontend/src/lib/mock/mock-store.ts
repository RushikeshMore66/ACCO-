import { Customer, CustomerCreate, CustomerUpdate } from "@/types/customer";
import { Invoice, InvoiceCreate, InvoiceUpdate, InvoiceVoid } from "@/types/invoice";
import { PaymentResponse, PaymentCreate, PaymentAllocationCreate, PaymentReversalCreate } from "@/types/payment";
import { PaymentPromise, PromiseCreate, Dispute, DisputeCreate, DisputeResolve } from "@/types/promises_disputes";
import { TeamMember, TeamInviteRequest, TeamRoleUpdateRequest } from "@/types/auth";
import {
  CollectionPolicy,
  CollectionPolicyUpdate,
  OrganizationProfile,
  OrganizationSettingsUpdate,
  AppNotification,
  AuditEvent,
} from "@/types/collections";

// Initial Seed Data
const ORG_ID = "org-demo-123";

let organizationProfile: OrganizationProfile = {
  id: ORG_ID,
  name: "ACCO Demo Corp",
  slug: "acco-demo-corp",
  base_currency: "INR",
  tax_identifier: "GSTIN-27AAAAA0000A1Z5",
  is_active: true,
  created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
};

let collectionPolicy: CollectionPolicy = {
  id: "pol-demo-1",
  organization_id: ORG_ID,
  initial_reminder_after_days: 1,
  follow_up_after_days: 8,
  escalation_after_days: 31,
  require_approval_before_send: true,
  pause_collection_on_dispute: true,
  pause_collection_on_payment_promise: true,
  created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
  updated_at: new Date(Date.now() - 10 * 86400000).toISOString(),
};

let appNotifications: AppNotification[] = [
  {
    id: "notif-1",
    type: "INVOICE_OVERDUE",
    title: "Invoice #INV-2026-001 Overdue",
    message: "Invoice for Acme Corp (150,000 INR) is past due date.",
    timestamp: new Date(Date.now() - 25 * 60000).toISOString(),
    read: false,
    href: "/invoices/inv-1",
    meta: { invoice_id: "inv-1", customer_id: "cust-1" },
  },
  {
    id: "notif-2",
    type: "PROMISE_APPROACHING",
    title: "Payment Promise Due Soon",
    message: "Globex Inc promise of 50,000 INR is scheduled for review.",
    timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
    read: false,
    href: "/collections/promises",
    meta: { customer_id: "cust-2" },
  },
  {
    id: "notif-3",
    type: "PAYMENT_RECORDED",
    title: "New Payment Receipt",
    message: "Payment of 1,500.00 INR recorded and allocated to INV-2026-001.",
    timestamp: new Date(Date.now() - 360 * 60000).toISOString(),
    read: true,
    href: "/collections/payments",
    meta: { payment_id: "pay-1" },
  },
  {
    id: "notif-4",
    type: "CUSTOMER_REPLY",
    title: "Customer Inbound Reply",
    message: "Acme Corp replied to follow-up notice with payment intention.",
    timestamp: new Date(Date.now() - 24 * 3600000).toISOString(),
    read: true,
    href: "/communications",
    meta: { customer_id: "cust-1" },
  },
  {
    id: "notif-5",
    type: "DISPUTE_OPENED",
    title: "Dispute Ticket Under Review",
    message: "Dispute opened for service clarification on INV-2026-002.",
    timestamp: new Date(Date.now() - 48 * 3600000).toISOString(),
    read: true,
    href: "/collections/disputes",
    meta: { invoice_id: "inv-2" },
  },
];

let auditEvents: AuditEvent[] = [
  {
    id: "audit-1",
    event_type: "PAYMENT_ALLOCATED",
    actor: "Alice Admin (Owner)",
    target: "INV-2026-001",
    target_id: "inv-1",
    description: "Allocated 1,500.00 INR payment receipt TRX-829103 to invoice balance.",
    created_at: new Date(Date.now() - 15 * 60000).toISOString(),
    is_demo: true,
  },
  {
    id: "audit-2",
    event_type: "PROMISE_CREATED",
    actor: "Charlie Collector",
    target: "INV-2026-001",
    target_id: "inv-1",
    description: "Registered formal commitment of 50,000 INR with due date confirmation.",
    created_at: new Date(Date.now() - 120 * 60000).toISOString(),
    is_demo: true,
  },
  {
    id: "audit-3",
    event_type: "POLICY_UPDATED",
    actor: "Bob Finance (Finance Manager)",
    target: "Collection Policy",
    target_id: "pol-demo-1",
    description: "Adjusted dunning cadence: escalation threshold set to 31 days with mandatory approval.",
    created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    is_demo: true,
  },
  {
    id: "audit-4",
    event_type: "OUTREACH_APPROVED",
    actor: "Bob Finance (Finance Manager)",
    target: "Globex Inc",
    target_id: "cust-2",
    description: "Approved automated email reminder dispatch for overdue balance notice.",
    created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
    is_demo: true,
  },
  {
    id: "audit-5",
    event_type: "DISPUTE_OPENED",
    actor: "System AI / Inbound Parser",
    target: "INV-2026-002",
    target_id: "inv-2",
    description: "Inbound customer inquiry flagged potential billing discrepancy. Automated dunning paused.",
    created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
    is_demo: true,
  },
];


let teamMembers: TeamMember[] = [
  {
    id: "demo-u1",
    organization_id: ORG_ID,
    email: "alice.admin@acco.example",
    full_name: "Alice Admin",
    role: "OWNER",
    status: "ACTIVE",
    is_active: true,
    created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
    is_demo: true,
  },
  {
    id: "demo-u2",
    organization_id: ORG_ID,
    email: "bob.finance@acco.example",
    full_name: "Bob Finance",
    role: "FINANCE_MANAGER",
    status: "ACTIVE",
    is_active: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    is_demo: true,
  },
  {
    id: "demo-u3",
    organization_id: ORG_ID,
    email: "charlie.collector@acco.example",
    full_name: "Charlie Collector",
    role: "COLLECTOR",
    status: "ACTIVE",
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    is_demo: true,
  },
  {
    id: "demo-u4",
    organization_id: ORG_ID,
    email: "dave.viewer@acco.example",
    full_name: "Dave Viewer",
    role: "VIEWER",
    status: "PENDING_INVITATION",
    is_active: false,
    invited_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    is_demo: true,
  },
];


let customers: Customer[] = [
  {
    id: "cust-1",
    organization_id: ORG_ID,
    name: "Acme Corp",
    contact_name: "John Doe",
    email: "john@acme.example.com",
    phone: "+1234567890",
    billing_address: "123 Acme Way",
    tax_identifier: "TAX-123",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "cust-2",
    organization_id: ORG_ID,
    name: "Globex Inc",
    contact_name: "Jane Smith",
    email: "jane@globex.example.com",
    phone: "+0987654321",
    billing_address: "456 Globex Blvd",
    tax_identifier: "TAX-456",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
];

let invoices: Invoice[] = [
  {
    id: "inv-1",
    organization_id: ORG_ID,
    customer_id: "cust-1",
    invoice_number: "INV-2026-001",
    issue_date: new Date(Date.now() - 30 * 86400000).toISOString(),
    due_date: new Date(Date.now() - 15 * 86400000).toISOString(),
    currency: "INR",
    total_amount: 150000,
    description: "Software Services",
    status: "OVERDUE",
    void_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    voided_at: null,
  },
  {
    id: "inv-2",
    organization_id: ORG_ID,
    customer_id: "cust-2",
    invoice_number: "INV-2026-002",
    issue_date: new Date(Date.now() - 10 * 86400000).toISOString(),
    due_date: new Date(Date.now() + 5 * 86400000).toISOString(),
    currency: "INR",
    total_amount: 75000,
    description: "Consulting",
    status: "UNPAID",
    void_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    voided_at: null,
  }
];

let payments: PaymentResponse[] = [
  {
    id: "pay-1",
    organization_id: "org-demo-123",
    customer_id: "cust-1",
    amount: 1500.00,
    currency: "INR",
    payment_date: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
    payment_method: "BANK_TRANSFER",
    reference: "TRX-829103",
    notes: "Part payment",
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    allocated_amount: 1500.00,
    unallocated_amount: 0,
    allocations: [
      {
        id: "alloc-1",
        payment_id: "pay-1",
        invoice_id: "inv-1",
        amount: 1500.00,
        created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      }
    ],
    reversal: null
  },
  {
    id: "pay-2",
    organization_id: "org-demo-123",
    customer_id: "cust-2",
    amount: 500.00,
    currency: "USD",
    payment_date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
    payment_method: "CARD",
    reference: "CHG-99120",
    notes: "Overpayment",
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    allocated_amount: 0,
    unallocated_amount: 500.00,
    allocations: [],
    reversal: null
  },
  {
    id: "pay-3",
    organization_id: "org-demo-123",
    customer_id: "cust-1",
    amount: 50000.00,
    currency: "INR",
    payment_date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    payment_method: "ONLINE",
    reference: "PAY-ONL-5521",
    notes: "Milestone tranche 1",
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    allocated_amount: 20000.00,
    unallocated_amount: 30000.00,
    allocations: [
      {
        id: "alloc-2",
        payment_id: "pay-3",
        invoice_id: "inv-1",
        amount: 20000.00,
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      }
    ],
    reversal: null
  },
  {
    id: "pay-4",
    organization_id: "org-demo-123",
    customer_id: "cust-1",
    amount: 10000.00,
    currency: "INR",
    payment_date: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
    payment_method: "CHEQUE",
    reference: "CHQ-889102",
    notes: "Cheque deposited",
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    allocated_amount: 0,
    unallocated_amount: 10000.00,
    allocations: [],
    reversal: {
      id: "rev-1",
      reason: "Cheque bounced due to signature irregularity",
      reversed_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    }
  }
];
let promises: PaymentPromise[] = [
  {
    id: "prom-1",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    promised_amount: 100000,
    expected_payment_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    follow_up_date: new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0],
    status: "ACTIVE",
    notes: "Customer promised to pay 100000 next Tuesday.",
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    currency: "INR",
    reply_analysis_id: "ana-1",
    source_message_id: "msg-1"
  },
  {
    id: "prom-2",
    invoice_id: "inv-2",
    customer_id: "cust-2",
    promised_amount: 25000,
    expected_payment_date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    follow_up_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    status: "ACTIVE",
    notes: "Agreed partial wire transfer following procurement sign-off.",
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    currency: "INR"
  },
  {
    id: "prom-3",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    promised_amount: 50000,
    expected_payment_date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
    follow_up_date: new Date(Date.now() - 9 * 86400000).toISOString().split('T')[0],
    status: "FULFILLED",
    notes: "Fulfilled via direct NEFT payment batch TRX-829103.",
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    resolved_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    currency: "INR"
  },
  {
    id: "prom-4",
    invoice_id: "inv-3",
    customer_id: "cust-1",
    promised_amount: 15000,
    expected_payment_date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    follow_up_date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
    status: "MISSED",
    notes: "Debtor missed agreed wire cut-off date.",
    created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    resolved_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    currency: "INR"
  },
  {
    id: "prom-5",
    invoice_id: "inv-2",
    customer_id: "cust-2",
    promised_amount: 10000,
    expected_payment_date: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
    follow_up_date: new Date(Date.now() + 11 * 86400000).toISOString().split('T')[0],
    status: "CANCELLED",
    notes: "Cancelled: Customer requested updated billing address before committing.",
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    resolved_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    currency: "INR"
  }
];
let disputes: Dispute[] = [
  {
    id: "disp-1",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    category: "SERVICE_OR_PRODUCT_ISSUE",
    description: "Customer reported discrepancy on delivery items.",
    status: "UNDER_REVIEW",
    resolution_notes: null,
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    resolved_at: null
  },
  {
    id: "disp-2",
    invoice_id: "inv-2",
    customer_id: "cust-2",
    category: "INCORRECT_AMOUNT",
    description: "Customer claims billed quantity on line 4 differs from agreed purchase order.",
    status: "OPEN",
    resolution_notes: null,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    resolved_at: null
  },
  {
    id: "disp-3",
    invoice_id: "inv-3",
    customer_id: "cust-1",
    category: "PAYMENT_ALREADY_MADE",
    description: "Debtor stated payment was made via corporate card on previous Friday.",
    status: "OPEN",
    resolution_notes: null,
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    resolved_at: null
  },
  {
    id: "disp-4",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    category: "DUPLICATE_INVOICE",
    description: "Customer flagged duplicate invoice reference INV-2026-001 vs INV-2026-000A.",
    status: "RESOLVED",
    resolution_notes: "Confirmed original invoice was valid; duplicate credit note issued on secondary ref.",
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 12 * 86400000).toISOString(),
    resolved_at: new Date(Date.now() - 12 * 86400000).toISOString()
  }
];
let messages: any[] = [
  {
    id: "msg-1",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    direction: "INBOUND",
    channel: "EMAIL",
    status: "RECEIVED",
    subject: "Re: Overdue Invoice",
    body: "Hi, sorry for the delay. We had a missing goods issue but I will pay 100000 next Tuesday.",
    sent_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "msg-2",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    direction: "OUTBOUND",
    channel: "EMAIL",
    status: "SENT",
    subject: "Payment Reminder: INV-2026-001",
    body: "Dear Acme Corp, please note invoice INV-2026-001 is overdue. Kindly remit payment at your earliest convenience.",
    sent_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: "msg-3",
    invoice_id: "inv-2",
    customer_id: "cust-2",
    direction: "INBOUND",
    channel: "WHATSAPP",
    status: "RECEIVED",
    subject: null,
    body: "Hello, we noticed a billing discrepancy on item 4. Could you provide a revised copy of INV-2026-002?",
    sent_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "msg-4",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    direction: "INTERNAL_NOTE",
    channel: "INTERNAL",
    status: "RECORDED",
    subject: "Call with Controller",
    body: "Spoke with controller John Doe regarding delayed shipment. He confirmed payment was approved and queued.",
    sent_at: null,
    created_at: new Date(Date.now() - 43200000).toISOString(),
    updated_at: new Date(Date.now() - 43200000).toISOString(),
  }
];
let analyses: any[] = [
  {
    id: "ana-1",
    source_message_id: "msg-1",
    invoice_id: "inv-1",
    customer_id: "cust-1",
    organization_id: "org-demo-123",
    classification: "PAYMENT_PROMISE",
    confidence_score: 0.92,
    analysis_payload: {
      primary_classification: "PAYMENT_PROMISE",
      secondary_classifications: [],
      evidence_summary: "Customer promised to pay 100,000 next Tuesday following goods resolution.",
      customer_intent: "Pay 100,000 next Tuesday",
      explicit_payment_amount: 100000,
      currency: "INR",
      proposed_payment_date: "next Tuesday",
      claims_already_paid: false,
      dispute_category: null,
      requests_information: false,
      missing_information: null,
      recommended_next_action: "Review and create payment promise record.",
      requires_human_review: true,
      confidence_score: 0.92,
    },
    model_provider: "demo",
    model_name: "demo",
    prompt_version: "1.0",
    status: "PENDING_REVIEW",
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "ana-2",
    source_message_id: "msg-3",
    invoice_id: "inv-2",
    customer_id: "cust-2",
    organization_id: "org-demo-123",
    classification: "DISPUTE",
    confidence_score: 0.89,
    analysis_payload: {
      primary_classification: "DISPUTE",
      secondary_classifications: ["INVOICE_COPY_REQUEST"],
      evidence_summary: "Customer noted discrepancy on line item 4 and requested an updated copy.",
      customer_intent: "Clarify line item discrepancy before remitting payment",
      explicit_payment_amount: null,
      currency: null,
      proposed_payment_date: null,
      claims_already_paid: false,
      dispute_category: "BILLING_DISCREPANCY",
      requests_information: true,
      missing_information: "Line item 4 specifications",
      recommended_next_action: "Send itemized invoice copy and clarify billing details.",
      requires_human_review: true,
      confidence_score: 0.89,
    },
    model_provider: "demo",
    model_name: "demo",
    prompt_version: "1.0",
    status: "PENDING_REVIEW",
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  }
];

// Helper
const generateId = (prefix: string) => `${prefix}-${Math.random().toString(36).substring(2, 9)}`;

export const mockStore = {
  listCustomers(params?: { name?: string; email?: string; include_inactive?: boolean; limit?: number; offset?: number }) {
    let result = [...customers];
    if (!params?.include_inactive) {
      result = result.filter(c => c.is_active);
    }
    if (params?.name) {
      const q = params.name.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q)));
    }
    if (params?.email) {
      result = result.filter(c => c.email && c.email.toLowerCase().includes(params.email!.toLowerCase()));
    }
    if (params?.offset !== undefined) {
      result = result.slice(params.offset);
    }
    if (params?.limit !== undefined) {
      result = result.slice(0, params.limit);
    }
    return Promise.resolve(result);
  },
  getCustomer(id: string) {
    return Promise.resolve(customers.find(c => c.id === id));
  },
  createCustomer(data: CustomerCreate) {
    const customer: Customer = {
      ...data,
      id: generateId("cust"),
      organization_id: ORG_ID,
      contact_name: data.contact_name ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      billing_address: data.billing_address ?? null,
      tax_identifier: data.tax_identifier ?? null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    customers.push(customer);
    return Promise.resolve(customer);
  },
  updateCustomer(id: string, data: CustomerUpdate) {
    const idx = customers.findIndex(c => c.id === id);
    if (idx === -1) throw new Error("Customer not found");
    customers[idx] = { ...customers[idx], ...data, updated_at: new Date().toISOString() } as Customer;
    return Promise.resolve(customers[idx]);
  },

  // Invoices
  listInvoices(params?: { customer_id?: string; status?: string; limit?: number; offset?: number }) {
    let result = [...invoices];
    if (params?.customer_id) {
      result = result.filter(i => i.customer_id === params.customer_id);
    }
    if (params?.status) {
      result = result.filter(i => i.status === params.status);
    }
    if (params?.offset !== undefined) {
      result = result.slice(params.offset);
    }
    if (params?.limit !== undefined) {
      result = result.slice(0, params.limit);
    }
    return Promise.resolve(result);
  },
  getInvoice(id: string) {
    return Promise.resolve(invoices.find(i => i.id === id));
  },
  getInvoiceBalance(id: string) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) throw new Error("Invoice not found");
    // Calculate effective allocation for this invoice
    let effectiveAllocated = 0;
    for (const p of payments) {
      if (!p.reversal) {
        const invAlloc = p.allocations.filter(a => a.invoice_id === inv.id);
        effectiveAllocated += invAlloc.reduce((sum, a) => sum + Number(a.amount), 0);
      }
    }
    const balance = Math.max(0, Number(inv.total_amount) - effectiveAllocated);
    const isOverdue = inv.status === "OVERDUE" || (new Date(inv.due_date).getTime() < Date.now() && inv.status !== "PAID" && balance > 0);
    const overdueDays = isOverdue ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24))) : 0;
    const bucket = overdueDays === 0 ? "NOT_DUE" : overdueDays <= 30 ? "1_30" : overdueDays <= 60 ? "31_60" : overdueDays <= 90 ? "61_90" : "90_PLUS";
    return Promise.resolve({
      invoice_id: inv.id,
      customer_id: inv.customer_id,
      invoice_number: inv.invoice_number,
      currency: inv.currency,
      total_amount: inv.total_amount,
      paid_amount: effectiveAllocated,
      outstanding_amount: balance,
      days_overdue: overdueDays,
      payment_status: (balance <= 0 ? "PAID" : effectiveAllocated > 0 ? "PARTIALLY_PAID" : "UNPAID") as "UNPAID" | "PARTIALLY_PAID" | "PAID",
      aging_bucket: (balance <= 0 ? "PAID" : bucket) as any,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
    });
  },
  createInvoice(data: InvoiceCreate) {
    const invoice: Invoice = {
      ...data,
      id: generateId("inv"),
      organization_id: ORG_ID,
      description: data.description ?? null,
      status: "DRAFT",
      void_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      voided_at: null,
    };
    invoices.push(invoice);
    return Promise.resolve(invoice);
  },
  updateInvoice(id: string, data: InvoiceUpdate) {
    const idx = invoices.findIndex(i => i.id === id);
    if (idx === -1) throw new Error("Invoice not found");
    invoices[idx] = { ...invoices[idx], ...data, updated_at: new Date().toISOString() } as Invoice;
    return Promise.resolve(invoices[idx]);
  },
  voidInvoice(id: string, data: InvoiceVoid) {
    const idx = invoices.findIndex(i => i.id === id);
    if (idx === -1) throw new Error("Invoice not found");
    invoices[idx] = { 
      ...invoices[idx], 
      status: "VOID", 
      void_reason: data.void_reason,
      voided_at: new Date().toISOString(),
      updated_at: new Date().toISOString() 
    };
    return Promise.resolve(invoices[idx]);
  },

  // Payments
  listPayments(params?: { customer_id?: string; limit?: number; offset?: number }) {
    let result = [...payments];
    if (params?.customer_id) {
      result = result.filter(p => p.customer_id === params.customer_id);
    }
    if (params?.offset !== undefined) {
      result = result.slice(params.offset);
    }
    if (params?.limit !== undefined) {
      result = result.slice(0, params.limit);
    }
    return Promise.resolve(result);
  },
  getPayment(id: string) {
    const p = payments.find(p => p.id === id);
    if (!p) throw new Error("Not found");
    return Promise.resolve(p);
  },
  recordPayment(data: PaymentCreate) {
    const payment: PaymentResponse = {
      ...data,
      amount: Number(data.amount),
      id: generateId("pay"),
      organization_id: ORG_ID,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      created_at: new Date().toISOString(),
      allocated_amount: 0,
      unallocated_amount: Number(data.amount),
      allocations: [],
      reversal: null,
    };
    payments.push(payment);
    return Promise.resolve(payment);
  },
  allocatePayment(paymentId: string, data: PaymentAllocationCreate) {
    const p = payments.find(x => x.id === paymentId);
    if (!p) throw new Error("Payment not found");
    if (p.reversal) throw new Error("Cannot allocate a reversed payment");

    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error("Allocation amount must be greater than zero");
    }
    if (amount > p.unallocated_amount) {
      throw new Error(`Allocation amount ${amount} exceeds unallocated amount ${p.unallocated_amount}`);
    }

    const inv = invoices.find(x => x.id === data.invoice_id);
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "VOID" || inv.status === "DRAFT") {
      throw new Error("Cannot allocate to a draft or void invoice");
    }
    if (p.customer_id !== inv.customer_id) {
      throw new Error("Payment and Invoice must belong to the same customer");
    }
    if (p.currency !== inv.currency) {
      throw new Error("Payment and Invoice currencies must match");
    }

    // Check outstanding balance on invoice
    let effectiveAllocated = 0;
    for (const pay of payments) {
      if (!pay.reversal) {
        effectiveAllocated += pay.allocations
          .filter(a => a.invoice_id === inv.id)
          .reduce((sum, a) => sum + Number(a.amount), 0);
      }
    }
    const outstanding = Math.max(0, Number(inv.total_amount) - effectiveAllocated);
    if (amount > outstanding) {
      throw new Error(`Allocation amount ${amount} exceeds invoice outstanding balance ${outstanding}`);
    }

    const alloc = {
      id: generateId("alloc"),
      payment_id: p.id,
      invoice_id: data.invoice_id,
      amount: amount,
      created_at: new Date().toISOString()
    };
    
    p.allocations.push(alloc);
    p.allocated_amount += amount;
    p.unallocated_amount -= amount;
    
    // Update invoice status
    const newTotalAllocated = effectiveAllocated + amount;
    if (newTotalAllocated >= Number(inv.total_amount)) {
      inv.status = "PAID";
    } else {
      inv.status = "PARTIALLY_PAID";
    }
    
    return Promise.resolve({ ...p });
  },
  reversePayment(paymentId: string, data: PaymentReversalCreate) {
    const p = payments.find(x => x.id === paymentId);
    if (!p) throw new Error("Payment not found");
    if (p.reversal) throw new Error("Payment is already reversed");
    if (!data.reason || !data.reason.trim()) {
      throw new Error("Reversal reason is required");
    }
    
    p.reversal = {
      id: generateId("rev"),
      reason: data.reason.trim(),
      reversed_at: new Date().toISOString()
    };
    
    // Reverse invoice allocations
    for (const alloc of p.allocations) {
      const inv = invoices.find(x => x.id === alloc.invoice_id);
      if (inv) {
        let remainingAlloc = 0;
        for (const pay of payments) {
          if (!pay.reversal && pay.id !== p.id) {
            remainingAlloc += pay.allocations
              .filter(a => a.invoice_id === inv.id)
              .reduce((sum, a) => sum + Number(a.amount), 0);
          }
        }
        if (remainingAlloc <= 0) {
          inv.status = (new Date(inv.due_date).getTime() < Date.now()) ? "OVERDUE" : "UNPAID";
        } else if (remainingAlloc < Number(inv.total_amount)) {
          inv.status = "PARTIALLY_PAID";
        } else {
          inv.status = "PAID";
        }
      }
    }
    
    return Promise.resolve({ ...p });
  },

  // Promises
  listAllPromises() {
    return Promise.resolve([...promises]);
  },
  getPromises(invoiceId: string) {
    return Promise.resolve(promises.filter(p => p.invoice_id === invoiceId));
  },
  createPromise(invoiceId: string, data: PromiseCreate) {
    const inv = invoices.find(x => x.id === invoiceId);
    const promise: PaymentPromise = {
      ...data,
      id: generateId("prom"),
      invoice_id: invoiceId,
      customer_id: inv ? inv.customer_id : undefined,
      currency: inv ? inv.currency : "INR",
      status: "ACTIVE",
      notes: data.notes ?? null,
      follow_up_date: data.follow_up_date,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    promises.push(promise);
    return Promise.resolve(promise);
  },
  cancelPromise(promiseId: string, data?: { cancellation_reason?: string }) {
    const idx = promises.findIndex(p => p.id === promiseId);
    if (idx === -1) throw new Error("Promise not found");
    const currentNotes = promises[idx].notes;
    const reason = data?.cancellation_reason ? `Cancelled: ${data.cancellation_reason}` : "Cancelled";
    promises[idx] = {
      ...promises[idx],
      status: "CANCELLED",
      notes: currentNotes ? `${currentNotes}\n${reason}` : reason,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    return Promise.resolve(promises[idx]);
  },
  markPromiseFulfilled(promiseId: string) {
    const idx = promises.findIndex(p => p.id === promiseId);
    if (idx === -1) throw new Error("Promise not found");
    promises[idx] = {
      ...promises[idx],
      status: "FULFILLED",
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    return Promise.resolve(promises[idx]);
  },
  markPromiseMissed(promiseId: string) {
    const idx = promises.findIndex(p => p.id === promiseId);
    if (idx === -1) throw new Error("Promise not found");
    promises[idx] = {
      ...promises[idx],
      status: "MISSED",
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    return Promise.resolve(promises[idx]);
  },

  // Disputes
  listAllDisputes() {
    return Promise.resolve([...disputes]);
  },
  getDisputes(invoiceId: string) {
    return Promise.resolve(disputes.filter(d => d.invoice_id === invoiceId));
  },
  createDispute(invoiceId: string, data: DisputeCreate) {
    const inv = invoices.find(x => x.id === invoiceId);
    const dispute: Dispute = {
      ...data,
      id: generateId("disp"),
      invoice_id: invoiceId,
      customer_id: inv ? inv.customer_id : undefined,
      status: "OPEN",
      resolution_notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolved_at: null,
    };
    disputes.push(dispute);
    return Promise.resolve(dispute);
  },
  startDisputeReview(disputeId: string) {
    const idx = disputes.findIndex(d => d.id === disputeId);
    if (idx === -1) throw new Error("Dispute not found");
    disputes[idx] = {
      ...disputes[idx],
      status: "UNDER_REVIEW",
      updated_at: new Date().toISOString()
    };
    return Promise.resolve(disputes[idx]);
  },
  resolveDispute(disputeId: string, data: DisputeResolve | { resolution_notes: string }) {
    const idx = disputes.findIndex(d => d.id === disputeId);
    if (idx === -1) throw new Error("Dispute not found");
    disputes[idx] = { 
      ...disputes[idx], 
      status: "RESOLVED",
      resolution_notes: data.resolution_notes,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString() 
    };
    return Promise.resolve(disputes[idx]);
  },
  rejectDispute(disputeId: string, data: { rejection_reason: string }) {
    const idx = disputes.findIndex(d => d.id === disputeId);
    if (idx === -1) throw new Error("Dispute not found");
    disputes[idx] = { 
      ...disputes[idx], 
      status: "REJECTED",
      resolution_notes: data.rejection_reason,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString() 
    };
    return Promise.resolve(disputes[idx]);
  },

  // Receivables
  getReceivablesInvoices(params?: { limit?: number; offset?: number; customer_id?: string }) {
    let result = invoices.map(inv => {
      // Calculate effective allocation for this invoice
      let effectiveAllocated = 0;
      for (const p of payments) {
        if (!p.reversal) {
          const invAlloc = p.allocations.filter(a => a.invoice_id === inv.id);
          effectiveAllocated += invAlloc.reduce((sum, a) => sum + Number(a.amount), 0);
        }
      }
      const balance = Number(inv.total_amount) - effectiveAllocated;
      return {
        invoice_id: inv.id,
        customer_id: inv.customer_id,
        invoice_number: inv.invoice_number,
        currency: inv.currency,
        total_amount: inv.total_amount,
        paid_amount: effectiveAllocated,
        outstanding_amount: balance,
        days_overdue: inv.status === "OVERDUE" ? 15 : 0,
        payment_status: balance <= 0 ? "PAID" : effectiveAllocated > 0 ? "PARTIALLY_PAID" : "UNPAID",
        aging_bucket: inv.status === "OVERDUE" ? "1_30" : "NOT_DUE"
      } as any;
    });
    if (params?.customer_id) {
      result = result.filter(r => r.customer_id === params.customer_id);
    }
    return Promise.resolve(result);
  },
  getReceivablesSummary() {
    const byCurrency: Record<string, any> = {};
    for (const inv of invoices) {
      if (inv.status === "VOID" || inv.status === "DRAFT") continue;
      const curr = inv.currency || "INR";
      if (!byCurrency[curr]) {
        byCurrency[curr] = {
          currency: curr,
          invoices_count: 0,
          total_issued_amount: 0,
          total_allocated_amount: 0,
          total_outstanding_amount: 0,
          overdue_invoices_count: 0,
          total_overdue_amount: 0,
        };
      }
      let alloc = 0;
      for (const p of payments) {
        if (!p.reversal) {
          alloc += p.allocations
            .filter((a) => a.invoice_id === inv.id)
            .reduce((s, a) => s + Number(a.amount), 0);
        }
      }
      const out = Math.max(0, Number(inv.total_amount) - alloc);
      const isOverdue = inv.status === "OVERDUE" || (new Date(inv.due_date).getTime() < Date.now() && out > 0);

      byCurrency[curr].invoices_count += 1;
      byCurrency[curr].total_issued_amount += Number(inv.total_amount);
      byCurrency[curr].total_allocated_amount += alloc;
      byCurrency[curr].total_outstanding_amount += out;

      if (isOverdue && out > 0) {
        byCurrency[curr].overdue_invoices_count += 1;
        byCurrency[curr].total_overdue_amount += out;
      }
    }

    const summaries = Object.values(byCurrency);
    if (summaries.length === 0) {
      summaries.push({
        currency: "INR",
        invoices_count: 0,
        total_issued_amount: 0,
        total_allocated_amount: 0,
        total_outstanding_amount: 0,
        overdue_invoices_count: 0,
        total_overdue_amount: 0,
      });
    }
    return Promise.resolve(summaries);
  },
  getReceivablesAging() {
    const bucketsByCurrency: Record<string, Record<string, { count: number; amount: number }>> = {};
    for (const inv of invoices) {
      if (inv.status === "VOID" || inv.status === "DRAFT") continue;
      const curr = inv.currency || "INR";
      if (!bucketsByCurrency[curr]) {
        bucketsByCurrency[curr] = {
          NOT_DUE: { count: 0, amount: 0 },
          "1_30": { count: 0, amount: 0 },
          "31_60": { count: 0, amount: 0 },
          "61_90": { count: 0, amount: 0 },
          "90_PLUS": { count: 0, amount: 0 },
        };
      }

      let alloc = 0;
      for (const p of payments) {
        if (!p.reversal) {
          alloc += p.allocations
            .filter((a) => a.invoice_id === inv.id)
            .reduce((s, a) => s + Number(a.amount), 0);
        }
      }
      const out = Math.max(0, Number(inv.total_amount) - alloc);
      if (out <= 0) continue;

      const overdueDays = Math.max(
        0,
        Math.floor((Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24))
      );
      const isPastDue = inv.status === "OVERDUE" || (new Date(inv.due_date).getTime() < Date.now());
      const bucketName = !isPastDue || overdueDays === 0
        ? "NOT_DUE"
        : overdueDays <= 30
          ? "1_30"
          : overdueDays <= 60
            ? "31_60"
            : overdueDays <= 90
              ? "61_90"
              : "90_PLUS";

      bucketsByCurrency[curr][bucketName].count += 1;
      bucketsByCurrency[curr][bucketName].amount += out;
    }

    const report = Object.entries(bucketsByCurrency).map(([curr, bMap]) => ({
      currency: curr,
      buckets: (["NOT_DUE", "1_30", "31_60", "61_90", "90_PLUS"] as const).map((b) => ({
        bucket: b,
        outstanding_invoices_count: bMap[b].count,
        outstanding_amount: bMap[b].amount,
      })),
    }));

    if (report.length === 0) {
      report.push({
        currency: "INR",
        buckets: (["NOT_DUE", "1_30", "31_60", "61_90", "90_PLUS"] as const).map((b) => ({
          bucket: b,
          outstanding_invoices_count: 0,
          outstanding_amount: 0,
        })),
      });
    }
    return Promise.resolve(report);
  },

  // Communications
  listAllMessages() {
    return Promise.resolve([...messages].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  },
  getMessagesByInvoice(invoiceId: string) {
    return Promise.resolve(messages.filter(m => m.invoice_id === invoiceId));
  },
  recordInbound(invoiceId: string, data: any) {
    const msg = {
      ...data,
      id: generateId("msg"),
      invoice_id: invoiceId,
      status: "RECEIVED",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    messages.push(msg);
    return Promise.resolve(msg);
  },
  getTimeline(invoiceId: string) {
    if (invoiceId === "inv-1") {
      return Promise.resolve([
        {
          id: "act-1",
          event_type: "PROMISE_CREATED",
          description: "Payment promise of ₹1,00,000 scheduled for next Tuesday",
          created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        },
        {
          id: "act-2",
          event_type: "NOTE_RECORDED",
          description: "Customer email received regarding missing goods discrepancy",
          created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        },
        {
          id: "act-3",
          event_type: "PAYMENT_RECORDED",
          description: "Payment TRX-829103 of ₹1,500 allocated",
          created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        },
        {
          id: "act-4",
          event_type: "DISPUTE_OPENED",
          description: "Dispute opened for MISSING_GOODS",
          created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
        },
        {
          id: "act-5",
          event_type: "INVOICE_ISSUED",
          description: "Invoice INV-2026-001 issued to Acme Corp",
          created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        }
      ]);
    }
    return Promise.resolve([]);
  },

  // Analyses
  analyzeMessage(messageId: string) {
    const existing = analyses.find(a => a.source_message_id === messageId);
    if (existing) {
      return Promise.resolve(existing);
    }
    const msg = messages.find(m => m.id === messageId);
    if (!msg) throw new Error("Message not found");
    const newAnalysis = {
      id: generateId("ana"),
      source_message_id: messageId,
      invoice_id: msg.invoice_id || null,
      customer_id: msg.customer_id || "cust-1",
      organization_id: ORG_ID,
      classification: "PAYMENT_PROMISE",
      confidence_score: 0.91,
      analysis_payload: {
        primary_classification: "PAYMENT_PROMISE",
        secondary_classifications: [],
        evidence_summary: "AI analysis extracted customer intent from inbound message.",
        customer_intent: "Intent extracted from customer communication.",
        explicit_payment_amount: 50000,
        currency: "INR",
        proposed_payment_date: "next week",
        claims_already_paid: false,
        dispute_category: null,
        requests_information: false,
        missing_information: null,
        recommended_next_action: "Review extracted promise terms and confirm follow-up.",
        requires_human_review: true,
        confidence_score: 0.91,
      },
      model_provider: "demo",
      model_name: "demo",
      prompt_version: "1.0",
      status: "PENDING_REVIEW",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    analyses.push(newAnalysis);
    return Promise.resolve(newAnalysis);
  },
  getAnalyses(messageId: string) {
    return Promise.resolve(analyses.filter(a => a.source_message_id === messageId));
  },
  listAllAnalyses() {
    return Promise.resolve([...analyses]);
  },
  reviewAnalysis(analysisId: string, req: any) {
    const idx = analyses.findIndex(a => a.id === analysisId);
    if (idx === -1) throw new Error("Analysis not found");
    analyses[idx] = { ...analyses[idx], status: req.status, review_notes: req.notes };
    return Promise.resolve(analyses[idx]);
  },

  // Team Management (Demo Mode Only)
  listTeamMembers() {
    return Promise.resolve([...teamMembers]);
  },
  inviteTeamMember(req: TeamInviteRequest) {
    const existing = teamMembers.find(
      (m) => m.email.toLowerCase() === req.email.toLowerCase()
    );
    if (existing) {
      throw new Error("A team member with this email already exists");
    }
    const newMember: TeamMember = {
      id: generateId("demo-u"),
      organization_id: ORG_ID,
      email: req.email.toLowerCase().trim(),
      full_name: req.full_name.trim(),
      role: req.role,
      status: "PENDING_INVITATION",
      is_active: false,
      invited_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_demo: true,
    };
    teamMembers.push(newMember);
    return Promise.resolve(newMember);
  },
  updateTeamMemberRole(req: TeamRoleUpdateRequest) {
    const idx = teamMembers.findIndex((m) => m.id === req.user_id);
    if (idx === -1) throw new Error("Team member not found");
    teamMembers[idx] = {
      ...teamMembers[idx],
      role: req.role,
    };
    return Promise.resolve(teamMembers[idx]);
  },

  // Organization Profile (Demo Mode Only)
  getOrganizationProfile() {
    return Promise.resolve({ ...organizationProfile });
  },
  updateOrganizationProfile(data: OrganizationSettingsUpdate) {
    organizationProfile = {
      ...organizationProfile,
      name: data.name,
      base_currency: data.base_currency,
      tax_identifier: data.tax_identifier,
    };
    return Promise.resolve({ ...organizationProfile });
  },

  // Collection Policies (Demo Mode Only)
  getCollectionPolicy() {
    return Promise.resolve({ ...collectionPolicy });
  },
  updateCollectionPolicy(data: CollectionPolicyUpdate) {
    collectionPolicy = {
      ...collectionPolicy,
      ...data,
      updated_at: new Date().toISOString(),
    };
    return Promise.resolve({ ...collectionPolicy });
  },

  // Notifications (Demo Mode Only)
  listNotifications() {
    return Promise.resolve([...appNotifications]);
  },
  markNotificationRead(notificationId: string) {
    const notif = appNotifications.find((n) => n.id === notificationId);
    if (notif) {
      notif.read = true;
    }
    return Promise.resolve([...appNotifications]);
  },
  markAllNotificationsRead() {
    appNotifications.forEach((n) => {
      n.read = true;
    });
    return Promise.resolve([...appNotifications]);
  },

  // Activity & Audit Log (Demo Mode Only)
  listAuditEvents(params?: { event_type?: string; actor?: string }) {
    let result = [...auditEvents];
    if (params?.event_type && params.event_type !== "ALL") {
      result = result.filter((e) => e.event_type === params.event_type);
    }
    if (params?.actor) {
      const q = params.actor.toLowerCase();
      result = result.filter(
        (e) =>
          e.actor.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }
    return Promise.resolve(result);
  },
};


