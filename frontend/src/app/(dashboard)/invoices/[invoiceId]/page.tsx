"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoicesApi } from "@/lib/api/invoices.api";
import { customersApi } from "@/lib/api/customers.api";
import { paymentsApi } from "@/lib/api/payments.api";
import { collectionsApi } from "@/lib/api/collections.api";
import { communicationsApi } from "@/lib/api/communications.api";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  daysOverdue,
} from "@/lib/formatting/dates";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  FileText,
  AlertCircle,
  Clock,
  ShieldAlert,
  MessageSquare,
  History,
  CheckCircle2,
  XCircle,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileWarning,
} from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";

interface InvoiceDetailPageProps {
  params: {
    invoiceId: string;
  };
}

export default function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { invoiceId } = params;
  const [activeTab, setActiveTab] = useState("overview");

  // 1. Fetch Invoice
  const {
    data: invoice,
    isLoading: isInvoiceLoading,
    isError: isInvoiceError,
    error: invoiceError,
    refetch: refetchInvoice,
  } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
  });

  // 2. Fetch Customer
  const { data: customer, isLoading: isCustomerLoading } = useQuery({
    queryKey: ["customer", invoice?.customer_id],
    queryFn: () => customersApi.get(invoice!.customer_id),
    enabled: !!invoice?.customer_id,
  });

  // 3. Fetch Canonical Balance (only applicable for ISSUED invoices)
  const isIssued = invoice?.status === "ISSUED";
  const { data: invoiceBalance, isLoading: isBalanceLoading } = useQuery({
    queryKey: ["invoice-balance", invoiceId],
    queryFn: () => invoicesApi.getBalance(invoiceId),
    enabled: !!invoice && isIssued,
    retry: false, // Don't retry if backend rejects non-issued invoices
  });

  // 4. Fetch Payments for this customer to find allocations to this invoice
  const { data: customerPayments = [], isLoading: isPaymentsLoading } = useQuery({
    queryKey: ["payments-by-customer", invoice?.customer_id],
    queryFn: () => paymentsApi.listPayments(),
    enabled: !!invoice?.customer_id,
  });

  // 5. Fetch Payment Promises for this invoice
  const { data: promises = [], isLoading: isPromisesLoading } = useQuery({
    queryKey: ["collections-promises", invoiceId],
    queryFn: () => collectionsApi.getPromises(invoiceId),
    enabled: !!invoice,
  });

  // 6. Fetch Disputes for this invoice
  const { data: disputes = [], isLoading: isDisputesLoading } = useQuery({
    queryKey: ["collections-disputes", invoiceId],
    queryFn: () => collectionsApi.getDisputes(invoiceId),
    enabled: !!invoice,
  });

  // 7. Fetch Messages for this invoice
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery({
    queryKey: ["collections-messages", invoiceId],
    queryFn: () => communicationsApi.getMessagesByInvoice(invoiceId),
    enabled: !!invoice,
  });

  // 8. Fetch Timeline Activity for this invoice
  const { data: timeline = [], isLoading: isTimelineLoading } = useQuery({
    queryKey: ["collections-timeline", invoiceId],
    queryFn: () => communicationsApi.getTimeline(invoiceId),
    enabled: !!invoice,
  });

  // Extract allocations specifically tied to this invoice across all customer payments
  const invoiceAllocations = useMemo(() => {
    const list: Array<{
      allocationId: string;
      paymentId: string;
      amount: number;
      createdAt: string;
      paymentDate: string;
      paymentMethod: string;
      reference: string | null;
      notes: string | null;
      isReversed: boolean;
      reversalReason: string | null;
      reversedAt: string | null;
    }> = [];

    customerPayments.forEach((p) => {
      const isReversed = !!p.reversal;
      p.allocations?.forEach((alloc) => {
        if (alloc.invoice_id === invoiceId) {
          list.push({
            allocationId: alloc.id,
            paymentId: p.id,
            amount: Number(alloc.amount),
            createdAt: alloc.created_at,
            paymentDate: p.payment_date,
            paymentMethod: p.payment_method,
            reference: p.reference,
            notes: p.notes,
            isReversed,
            reversalReason: p.reversal?.reason ?? null,
            reversedAt: p.reversal?.reversed_at ?? null,
          });
        }
      });
    });

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [customerPayments, invoiceId]);

  // Financial calculations
  const authoritativeValues = useMemo(() => {
    if (!invoice) {
      return {
        totalAmount: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        paymentStatus: "UNPAID" as const,
        agingBucket: "NOT_DUE",
        overdueDays: 0,
      };
    }

    const total = Number(invoice.total_amount);

    if (invoice.status === "VOID") {
      return {
        totalAmount: total,
        paidAmount: 0,
        outstandingAmount: 0,
        paymentStatus: "VOID" as const,
        agingBucket: "NOT_DUE",
        overdueDays: 0,
      };
    }

    if (invoice.status === "DRAFT") {
      return {
        totalAmount: total,
        paidAmount: 0,
        outstandingAmount: total,
        paymentStatus: "UNPAID" as const,
        agingBucket: "NOT_DUE",
        overdueDays: 0,
      };
    }

    // If backend balance endpoint succeeded, use authoritative backend figures
    if (invoiceBalance) {
      return {
        totalAmount: Number(invoiceBalance.total_amount),
        paidAmount: Number(invoiceBalance.paid_amount),
        outstandingAmount: Number(invoiceBalance.outstanding_amount),
        paymentStatus: invoiceBalance.payment_status,
        agingBucket: invoiceBalance.aging_bucket,
        overdueDays: invoiceBalance.days_overdue,
      };
    }

    // Fallback based on active allocations if balance query is pending
    const activeAllocated = invoiceAllocations
      .filter((a) => !a.isReversed)
      .reduce((sum, a) => sum + a.amount, 0);

    const outstanding = Math.max(0, total - activeAllocated);
    const overdue = daysOverdue(invoice.due_date);
    const paymentStatus =
      outstanding <= 0 ? "PAID" : activeAllocated > 0 ? "PARTIALLY_PAID" : "UNPAID";

    let bucket = "NOT_DUE";
    if (paymentStatus === "PAID") {
      bucket = "PAID";
    } else if (overdue > 0) {
      bucket = overdue <= 30 ? "1_30" : overdue <= 60 ? "31_60" : overdue <= 90 ? "61_90" : "90_PLUS";
    }

    return {
      totalAmount: total,
      paidAmount: activeAllocated,
      outstandingAmount: outstanding,
      paymentStatus,
      agingBucket: bucket,
      overdueDays: overdue > 0 && paymentStatus !== "PAID" ? overdue : 0,
    };
  }, [invoice, invoiceBalance, invoiceAllocations]);

  // Loading state
  if (isInvoiceLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton height={36} width={36} className="rounded-md" />
          <div className="space-y-2">
            <Skeleton height={28} width={220} />
            <Skeleton height={16} width={150} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton height={96} className="rounded-xl" />
          <Skeleton height={96} className="rounded-xl" />
          <Skeleton height={96} className="rounded-xl" />
          <Skeleton height={96} className="rounded-xl" />
        </div>
        <Skeleton height={420} className="w-full rounded-xl" />
      </div>
    );
  }

  // Not Found / Error state
  if (isInvoiceError || !invoice) {
    const is404 =
      invoiceError &&
      typeof invoiceError === "object" &&
      "status" in invoiceError &&
      (invoiceError as { status: number }).status === 404;

    return (
      <div className="max-w-2xl mx-auto p-8 mt-12">
        <EmptyState
          icon={is404 ? FileText : AlertCircle}
          title={is404 ? "Invoice Not Found" : "Unable to load invoice"}
          description={
            is404
              ? `No invoice was found with ID "${invoiceId}". It may have been removed or belongs to another organization.`
              : "Failed to connect to the ACCO invoice service. Please verify your connection."
          }
          action={{
            label: is404 ? "Back to Invoice Directory" : "Try Again",
            onClick: is404 ? () => (window.location.href = "/invoices") : () => refetchInvoice(),
          }}
        />
      </div>
    );
  }

  const { totalAmount, paidAmount, outstandingAmount, paymentStatus, agingBucket, overdueDays } =
    authoritativeValues;

  const isOverdue = overdueDays > 0 && invoice.status === "ISSUED" && paymentStatus !== "PAID";
  const activeDispute = disputes.find((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");
  const activePromise = promises.find((p) => p.status === "ACTIVE");

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Top Navigation & Invoice Identity Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/invoices"
            className="p-2 rounded-lg border border-surface-border bg-white text-text-secondary hover:text-text-primary hover:bg-surface transition-colors shadow-sm"
            aria-label="Back to Invoices"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">{invoice.invoice_number}</h1>
              {/* Canonical Status */}
              <StatusBadge type="invoice" status={invoice.status} />
              {/* Financial Settlement Status */}
              {invoice.status === "ISSUED" && (
                <StatusBadge type="invoice" status={paymentStatus} />
              )}
              {/* Aging bucket tag if overdue */}
              {isOverdue && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-status-error/10 text-status-error border border-status-error/20">
                  {overdueDays}d overdue ({agingBucket.replace("_", "-")})
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-1 flex items-center gap-2">
              <span>Customer:</span>
              {customer ? (
                <Link
                  href={`/customers/${customer.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {customer.name}
                </Link>
              ) : (
                <span className="text-text-muted">Loading customer...</span>
              )}
              <span className="text-surface-border">•</span>
              <span>Issued on {formatDate(invoice.issue_date)}</span>
            </p>
          </div>
        </div>

        {/* Quick link to customer collections */}
        {customer && (
          <Link
            href={`/collections?customer_id=${customer.id}`}
            className="text-xs font-medium text-brand hover:underline flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand/20 bg-brand-lavender/30"
          >
            <span>View Customer in Collections</span>
          </Link>
        )}
      </div>

      {/* Financial Health Summary Cards (Authoritative Balances) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Amount */}
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-text-secondary uppercase tracking-wider">
            <span>Invoice Total</span>
            <FileText size={16} className="text-text-muted" />
          </div>
          <div className="mt-3">
            <CurrencyDisplay amount={totalAmount} currency={invoice.currency} size="xl" />
            <div className="text-xs text-text-muted mt-1">Authoritative currency: {invoice.currency}</div>
          </div>
        </div>

        {/* Paid Amount */}
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-text-secondary uppercase tracking-wider">
            <span>Recorded Paid</span>
            <CreditCard size={16} className="text-text-muted" />
          </div>
          <div className="mt-3">
            <CurrencyDisplay
              amount={paidAmount}
              currency={invoice.currency}
              size="xl"
              className={paidAmount > 0 ? "text-status-success" : undefined}
            />
            <div className="text-xs text-text-muted mt-1">
              {invoiceAllocations.filter((a) => !a.isReversed).length} active allocation(s)
            </div>
          </div>
        </div>

        {/* Outstanding Balance */}
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-text-secondary uppercase tracking-wider">
            <span>Outstanding</span>
            <Clock size={16} className="text-text-muted" />
          </div>
          <div className="mt-3">
            <CurrencyDisplay
              amount={outstandingAmount}
              currency={invoice.currency}
              size="xl"
              className={outstandingAmount > 0 ? "text-brand" : "text-text-muted"}
            />
            <div className="text-xs text-text-muted mt-1">
              {outstandingAmount === 0 ? "Fully settled" : "Pending collection"}
            </div>
          </div>
        </div>

        {/* Due Date & Alerts */}
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-text-secondary uppercase tracking-wider">
            <span>Payment Due</span>
            <Calendar size={16} className="text-text-muted" />
          </div>
          <div className="mt-3">
            <div
              className={clsx(
                "text-lg font-bold",
                isOverdue ? "text-status-error" : "text-text-primary"
              )}
            >
              {formatDate(invoice.due_date)}
            </div>
            <div className="text-xs mt-1">
              {isOverdue ? (
                <span className="text-status-error font-medium">{overdueDays} days past due</span>
              ) : invoice.status === "PAID" ? (
                <span className="text-status-success font-medium">Invoice paid in full</span>
              ) : (
                <span className="text-text-muted">Due date scheduled</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Critical Status Alerts (Promises or Disputes) */}
      {(activeDispute || activePromise) && (
        <div className="space-y-3">
          {activeDispute && (
            <div className="flex items-start gap-3 p-4 rounded-xl border border-status-error/30 bg-status-error/5 text-sm">
              <ShieldAlert size={18} className="text-status-error shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-text-primary flex items-center gap-2">
                  <span>Active Dispute: {activeDispute.category.replace("_", " ")}</span>
                  <StatusBadge type="dispute" status={activeDispute.status} />
                </div>
                <p className="text-text-secondary mt-1">{activeDispute.description}</p>
              </div>
            </div>
          )}
          {activePromise && (
            <div className="flex items-start gap-3 p-4 rounded-xl border border-brand/30 bg-brand-lavender/40 text-sm">
              <CheckCircle2 size={18} className="text-brand shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-text-primary flex items-center gap-2">
                  <span>
                    Payment Promise: {invoice.currency} {Number(activePromise.promised_amount).toLocaleString()}
                  </span>
                  <StatusBadge type="promise" status={activePromise.status} />
                </div>
                <p className="text-text-secondary mt-1">
                  Expected on {formatDate(activePromise.expected_payment_date)}. Note: promises do not reduce the outstanding balance until actual payment is recorded.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Navigation for Detailed Financial and Collection History */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments" count={invoiceAllocations.length}>
            Payments & Allocations
          </TabsTrigger>
          <TabsTrigger value="promises" count={promises.length}>
            Promises
          </TabsTrigger>
          <TabsTrigger value="disputes" count={disputes.length}>
            Disputes
          </TabsTrigger>
          <TabsTrigger value="communications" count={messages.length + timeline.length}>
            Activity & History
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview & Metadata */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              {/* Core Invoice Details */}
              <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
                <h2 className="text-base font-semibold mb-4 text-text-primary flex items-center gap-2">
                  <FileText size={18} className="text-brand" />
                  Invoice Specifications
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                  <div>
                    <span className="block text-text-secondary text-xs uppercase tracking-wider mb-1">
                      Invoice Number
                    </span>
                    <span className="font-medium text-text-primary">{invoice.invoice_number}</span>
                  </div>
                  <div>
                    <span className="block text-text-secondary text-xs uppercase tracking-wider mb-1">
                      Canonical Status
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusBadge type="invoice" status={invoice.status} />
                      <span className="text-xs text-text-muted">({invoice.status})</span>
                    </div>
                  </div>
                  <div>
                    <span className="block text-text-secondary text-xs uppercase tracking-wider mb-1">
                      Issue Date
                    </span>
                    <span className="text-text-primary">{formatDate(invoice.issue_date)}</span>
                  </div>
                  <div>
                    <span className="block text-text-secondary text-xs uppercase tracking-wider mb-1">
                      Due Date
                    </span>
                    <span
                      className={
                        isOverdue ? "text-status-error font-medium" : "text-text-primary"
                      }
                    >
                      {formatDate(invoice.due_date)}{" "}
                      {isOverdue && `(${overdueDays} days overdue)`}
                    </span>
                  </div>
                  <div>
                    <span className="block text-text-secondary text-xs uppercase tracking-wider mb-1">
                      Created At
                    </span>
                    <span className="text-text-secondary text-xs">
                      {formatDateTime(invoice.created_at)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-text-secondary text-xs uppercase tracking-wider mb-1">
                      Last Updated
                    </span>
                    <span className="text-text-secondary text-xs">
                      {formatDateTime(invoice.updated_at)}
                    </span>
                  </div>
                  <div className="col-span-full">
                    <span className="block text-text-secondary text-xs uppercase tracking-wider mb-1">
                      Description / Line Summary
                    </span>
                    <p className="text-text-primary bg-surface/50 p-3 rounded-lg border border-surface-border">
                      {invoice.description || "No description provided."}
                    </p>
                  </div>
                  {invoice.status === "VOID" && (
                    <div className="col-span-full bg-status-error/5 p-4 rounded-lg border border-status-error/20">
                      <span className="block text-status-error font-semibold text-xs uppercase tracking-wider mb-1">
                        Void Reason & Timestamp
                      </span>
                      <p className="text-sm text-text-primary">
                        {invoice.void_reason || "No void reason specified."}
                      </p>
                      {invoice.voided_at && (
                        <p className="text-xs text-text-muted mt-1">
                          Voided at: {formatDateTime(invoice.voided_at)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Invariants & Financial Integrity Notice */}
              <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-2">
                  <ShieldAlert size={16} className="text-brand" />
                  Financial Accounting Invariants
                </h3>
                <ul className="text-xs text-text-secondary space-y-2 list-disc list-inside leading-relaxed">
                  <li>
                    <strong>Payment Promises</strong> represent customer intentions and do not reduce the outstanding balance.
                  </li>
                  <li>
                    <strong>Unconfirmed Claims</strong> of payment do not confirm receipt until settled via the canonical payment workflow.
                  </li>
                  <li>
                    <strong>Active Allocations</strong> only reduce outstanding debt when the corresponding payment is verified and unreversed.
                  </li>
                  <li>
                    <strong>Reversals</strong> cancel previous settlements and reinstate the canonical outstanding balance.
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Column: Customer Card */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4 flex items-center gap-2">
                  <Building2 size={16} className="text-brand" />
                  Customer Information
                </h2>
                {customer ? (
                  <div className="space-y-4 text-sm">
                    <div>
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-bold text-text-primary text-base hover:text-brand hover:underline"
                      >
                        {customer.name}
                      </Link>
                      <div className="text-xs text-text-muted mt-0.5">
                        {customer.is_active ? "Active account" : "Inactive account"}
                      </div>
                    </div>
                    <div className="border-t border-surface-border pt-3 space-y-2 text-xs">
                      <div>
                        <span className="text-text-muted block">Primary Contact</span>
                        <span className="font-medium text-text-primary">
                          {customer.contact_name || "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail size={13} className="text-text-muted shrink-0" />
                        <span className="text-text-primary truncate">{customer.email || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-text-muted shrink-0" />
                        <span className="text-text-primary">{customer.phone || "—"}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin size={13} className="text-text-muted shrink-0 mt-0.5" />
                        <span className="text-text-primary">{customer.billing_address || "—"}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-text-muted">Loading customer information...</div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Payments & Allocations */}
        <TabsContent value="payments">
          <div className="bg-white rounded-xl border border-surface-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-surface-border bg-surface flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-text-primary text-sm">Allocated Payments</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Direct payment allocations settled against this invoice. Reversed payments do not reduce the balance.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-text-muted mr-2">Total Settled:</span>
                <CurrencyDisplay
                  amount={paidAmount}
                  currency={invoice.currency}
                  size="md"
                  className="font-bold text-status-success"
                />
              </div>
            </div>

            {invoiceAllocations.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={CreditCard}
                  title="No payments allocated"
                  description="No payments have been recorded or allocated against this invoice yet."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      <th className="px-4 py-3">Payment Date</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3 text-right">Allocated Amount</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3">Notes & Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {invoiceAllocations.map((alloc) => (
                      <tr
                        key={alloc.allocationId}
                        className={clsx(
                          "transition-colors",
                          alloc.isReversed ? "bg-status-error/5 hover:bg-status-error/10" : "hover:bg-surface/50"
                        )}
                      >
                        <td className="px-4 py-3.5 align-top">
                          <span className="font-medium text-text-primary">
                            {formatDate(alloc.paymentDate)}
                          </span>
                          <div className="text-xs text-text-muted mt-0.5">
                            Recorded {formatDateShort(alloc.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-top font-mono text-xs text-text-primary">
                          {alloc.reference || "—"}
                        </td>
                        <td className="px-4 py-3.5 align-top text-text-secondary">
                          {alloc.paymentMethod.replace("_", " ")}
                        </td>
                        <td className="px-4 py-3.5 align-top text-right font-medium">
                          <CurrencyDisplay
                            amount={alloc.amount}
                            currency={invoice.currency}
                            size="md"
                            className={alloc.isReversed ? "line-through text-text-muted" : "text-status-success"}
                          />
                        </td>
                        <td className="px-4 py-3.5 align-top text-center">
                          {alloc.isReversed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-error px-2 py-0.5 rounded-full bg-status-error/10 border border-status-error/20">
                              <XCircle size={12} />
                              Reversed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-success px-2 py-0.5 rounded-full bg-status-success/10 border border-status-success/20">
                              <CheckCircle2 size={12} />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-top text-xs text-text-secondary max-w-xs">
                          {alloc.isReversed ? (
                            <div className="text-status-error">
                              <strong>Reversal Reason:</strong> {alloc.reversalReason || "Unspecified"}
                              {alloc.reversedAt && (
                                <div className="text-[11px] text-text-muted mt-0.5">
                                  Reversed on {formatDateTime(alloc.reversedAt)}
                                </div>
                              )}
                            </div>
                          ) : (
                            alloc.notes || "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 3: Payment Promises */}
        <TabsContent value="promises">
          <div className="space-y-4">
            <div className="bg-brand-lavender/30 border border-brand/20 p-4 rounded-xl text-xs text-text-secondary flex items-start gap-2">
              <Clock size={16} className="text-brand shrink-0 mt-0.5" />
              <div>
                <strong className="text-brand font-semibold block">Promise Tracking Rule:</strong>
                Payment promises represent non-binding customer payment commitments. In strict compliance with ACCO financial invariants, promises do not deduct from outstanding balance until an authoritative payment is allocated.
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-border shadow-sm overflow-hidden">
              {promises.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={Clock}
                    title="No payment promises recorded"
                    description="No payment promises have been created for this invoice."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        <th className="px-4 py-3">Promised Amount</th>
                        <th className="px-4 py-3">Expected Date</th>
                        <th className="px-4 py-3">Follow-up Date</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3">Notes & Reason</th>
                        <th className="px-4 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {promises.map((prom) => (
                        <tr key={prom.id} className="hover:bg-surface/50 transition-colors">
                          <td className="px-4 py-3.5 align-top font-semibold text-text-primary">
                            <CurrencyDisplay
                              amount={prom.promised_amount}
                              currency={prom.currency || invoice.currency}
                              size="md"
                            />
                          </td>
                          <td className="px-4 py-3.5 align-top text-text-primary">
                            {formatDate(prom.expected_payment_date)}
                          </td>
                          <td className="px-4 py-3.5 align-top text-text-secondary">
                            {formatDate(prom.follow_up_date || prom.updated_at)}
                          </td>
                          <td className="px-4 py-3.5 align-top text-center">
                            <StatusBadge type="promise" status={prom.status} />
                          </td>
                          <td className="px-4 py-3.5 align-top text-xs text-text-secondary max-w-xs">
                            {prom.notes || "—"}
                          </td>
                          <td className="px-4 py-3.5 align-top text-xs text-text-muted">
                            {formatDateTime(prom.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Disputes */}
        <TabsContent value="disputes">
          <div className="space-y-4">
            <div className="bg-surface border border-surface-border p-4 rounded-xl text-xs text-text-secondary flex items-start gap-2">
              <FileWarning size={16} className="text-status-warning shrink-0 mt-0.5" />
              <div>
                <strong className="text-text-primary font-semibold block">Dispute Protocol:</strong>
                Active disputes halt automated dunning workflows while retaining canonical debt records. Resolving a dispute does not generate payments.
              </div>
            </div>

            <div className="bg-white rounded-xl border border-surface-border shadow-sm overflow-hidden">
              {disputes.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={ShieldAlert}
                    title="No disputes recorded"
                    description="This invoice has no active or resolved dispute records."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3">Resolution Notes</th>
                        <th className="px-4 py-3">Opened</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {disputes.map((disp) => (
                        <tr key={disp.id} className="hover:bg-surface/50 transition-colors">
                          <td className="px-4 py-3.5 align-top font-semibold text-text-primary">
                            {disp.category.replace("_", " ")}
                          </td>
                          <td className="px-4 py-3.5 align-top text-text-secondary max-w-xs">
                            {disp.description}
                          </td>
                          <td className="px-4 py-3.5 align-top text-center">
                            <StatusBadge type="dispute" status={disp.status} />
                          </td>
                          <td className="px-4 py-3.5 align-top text-xs text-text-secondary">
                            {disp.resolution_notes || "—"}
                            {disp.resolved_at && (
                              <div className="text-[11px] text-text-muted mt-0.5">
                                Resolved on {formatDateShort(disp.resolved_at)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 align-top text-xs text-text-muted">
                            {formatDateTime(disp.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab 5: Communications & Activity Timeline */}
        <TabsContent value="communications">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Messages */}
            <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
              <h3 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
                <MessageSquare size={16} className="text-brand" />
                Collection Messages
              </h3>
              {messages.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No messages found"
                  description="No communications logged for this invoice."
                />
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-4 rounded-lg border border-surface-border bg-surface/40 space-y-2 text-sm"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-text-primary uppercase tracking-wider">
                          {msg.direction} • {msg.channel}
                        </span>
                        <span className="text-text-muted">
                          {formatDateTime(msg.sent_at || msg.created_at)}
                        </span>
                      </div>
                      {msg.subject && (
                        <div className="font-medium text-text-primary">{msg.subject}</div>
                      )}
                      <p className="text-text-secondary text-xs leading-relaxed whitespace-pre-wrap">
                        {msg.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity History Timeline */}
            <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
              <h3 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
                <History size={16} className="text-brand" />
                Audit & Activity Timeline
              </h3>
              {timeline.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No activity recorded"
                  description="No event logs registered for this invoice."
                />
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-border">
                  {timeline.map((event, idx) => (
                    <div key={event.id || idx} className="relative">
                      <div className="absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full bg-brand ring-4 ring-white" />
                      <div>
                        <span className="text-xs font-semibold text-text-primary uppercase tracking-wider block">
                          {event.event_type.replace("_", " ")}
                        </span>
                        <p className="text-xs text-text-secondary mt-0.5">{event.description}</p>
                        <span className="text-[11px] text-text-muted mt-1 block">
                          {formatDateTime(event.created_at || event.occurred_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
