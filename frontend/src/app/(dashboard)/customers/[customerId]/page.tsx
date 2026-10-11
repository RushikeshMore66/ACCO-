"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers.api";
import { receivablesApi } from "@/lib/api/receivables.api";
import { paymentsApi } from "@/lib/api/payments.api";
import { collectionsApi } from "@/lib/api/collections.api";
import { communicationsApi } from "@/lib/api/communications.api";
import { Customer } from "@/types/customer";
import { InvoiceBalanceResponse } from "@/types/receivables";
import { PaymentResponse } from "@/types/payment";
import { PaymentPromise, Dispute } from "@/types/promises_disputes";
import { CollectionMessage, TimelineEvent } from "@/types/collection_messages";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { KpiCard } from "@/components/shared/KpiCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { useDemoMode } from "@/providers/DemoModeProvider";
import { formatDate, formatDateShort, formatDateTime } from "@/lib/formatting/dates";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building2,
  FileText,
  CreditCard,
  Calendar,
  AlertCircle,
  Clock,
  ShieldAlert,
  MessageSquare,
  History,
  Edit2,
  ExternalLink,
  Receipt,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";

interface CustomerDetailPageProps {
  params: {
    customerId: string;
  };
}

export default function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { customerId } = params;
  const { isDemoMode } = useDemoMode();
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // 1. Fetch Customer Profile
  const {
    data: customer,
    isLoading: isCustomerLoading,
    isError: isCustomerError,
    error: customerError,
    refetch: refetchCustomer,
  } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => customersApi.get(customerId),
  });

  // 2. Fetch Issued Invoices with Canonical Balance Data
  const {
    data: invoices = [],
    isLoading: isInvoicesLoading,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ["receivables-invoices", customerId],
    queryFn: () => receivablesApi.getInvoices({ customer_id: customerId }),
    enabled: !!customerId,
  });

  // 3. Fetch Recorded Payments for this Customer
  const {
    data: payments = [],
    isLoading: isPaymentsLoading,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ["payments", { customer_id: customerId }],
    queryFn: () => paymentsApi.listPayments({ customer_id: customerId }),
    enabled: !!customerId,
  });

  // 4. Fetch Invoice-Scoped Promises, Disputes, Messages, and Timeline
  const invoiceIds = useMemo(() => invoices.map((inv) => inv.invoice_id), [invoices]);

  // Promises queries per invoice
  const promisesQueries = useQueries({
    queries: invoiceIds.map((invId) => ({
      queryKey: ["collections-promises", invId],
      queryFn: () => collectionsApi.getPromises(invId),
      enabled: !!invId,
    })),
  });

  // Disputes queries per invoice
  const disputesQueries = useQueries({
    queries: invoiceIds.map((invId) => ({
      queryKey: ["collections-disputes", invId],
      queryFn: () => collectionsApi.getDisputes(invId),
      enabled: !!invId,
    })),
  });

  // Messages queries per invoice
  const messagesQueries = useQueries({
    queries: invoiceIds.map((invId) => ({
      queryKey: ["collections-messages", invId],
      queryFn: () => communicationsApi.getMessagesByInvoice(invId),
      enabled: !!invId,
    })),
  });

  // Timeline queries per invoice
  const timelineQueries = useQueries({
    queries: invoiceIds.map((invId) => ({
      queryKey: ["collections-timeline", invId],
      queryFn: () => communicationsApi.getTimeline(invId),
      enabled: !!invId,
    })),
  });

  // Map invoice_id to invoice_number for display
  const invoiceMap = useMemo(() => {
    const map = new Map<string, InvoiceBalanceResponse>();
    invoices.forEach((inv) => map.set(inv.invoice_id, inv));
    return map;
  }, [invoices]);

  // Aggregate invoice-scoped promises
  const promises: (PaymentPromise & { invoiceNumber?: string })[] = useMemo(() => {
    const all: (PaymentPromise & { invoiceNumber?: string })[] = [];
    promisesQueries.forEach((q, idx) => {
      const invId = invoiceIds[idx];
      const invNumber = invoiceMap.get(invId)?.invoice_number;
      if (Array.isArray(q.data)) {
        q.data.forEach((p) => {
          all.push({ ...p, invoiceNumber: invNumber ?? p.invoice_id });
        });
      }
    });
    return all.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [promisesQueries, invoiceIds, invoiceMap]);

  // Aggregate invoice-scoped disputes
  const disputes: (Dispute & { invoiceNumber?: string })[] = useMemo(() => {
    const all: (Dispute & { invoiceNumber?: string })[] = [];
    disputesQueries.forEach((q, idx) => {
      const invId = invoiceIds[idx];
      const invNumber = invoiceMap.get(invId)?.invoice_number;
      if (Array.isArray(q.data)) {
        q.data.forEach((d) => {
          all.push({ ...d, invoiceNumber: invNumber ?? d.invoice_id });
        });
      }
    });
    return all.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [disputesQueries, invoiceIds, invoiceMap]);

  // Aggregate invoice-scoped messages
  const messages: (CollectionMessage & { invoiceNumber?: string })[] = useMemo(() => {
    const all: (CollectionMessage & { invoiceNumber?: string })[] = [];
    messagesQueries.forEach((q, idx) => {
      const invId = invoiceIds[idx];
      const invNumber = invoiceMap.get(invId)?.invoice_number;
      if (Array.isArray(q.data)) {
        q.data.forEach((m) => {
          all.push({ ...m, invoiceNumber: (invNumber ?? m.invoice_id) ?? undefined });
        });
      }
    });
    return all.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [messagesQueries, invoiceIds, invoiceMap]);

  // Aggregate invoice-scoped timeline events
  const timelineEvents: (TimelineEvent & { invoiceNumber?: string })[] = useMemo(() => {
    const all: (TimelineEvent & { invoiceNumber?: string })[] = [];
    timelineQueries.forEach((q, idx) => {
      const invId = invoiceIds[idx];
      const invNumber = invoiceMap.get(invId)?.invoice_number;
      if (Array.isArray(q.data)) {
        q.data.forEach((ev) => {
          all.push({ ...ev, invoiceNumber: invNumber ?? invId });
        });
      }
    });
    return all.sort((a, b) => {
      const tA = a.created_at || a.occurred_at || "";
      const tB = b.created_at || b.occurred_at || "";
      return new Date(tB).getTime() - new Date(tA).getTime();
    });
  }, [timelineQueries, invoiceIds, invoiceMap]);

  // ==========================================
  // Canonical Authoritative Financial Totals
  // ==========================================
  const financialTotals = useMemo(() => {
    let totalInvoiced = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let totalInvoicesPaid = 0;
    const currency = invoices[0]?.currency || "INR";

    invoices.forEach((inv) => {
      const total = Number(inv.total_amount) || 0;
      const outstanding = Number(inv.outstanding_amount) || 0;
      const paid = Number(inv.paid_amount) || 0;

      totalInvoiced += total;
      totalOutstanding += outstanding;
      totalInvoicesPaid += paid;

      if (inv.days_overdue > 0) {
        totalOverdue += outstanding;
      }
    });

    // Payments totals (recorded financial receipts only)
    let totalRecordedPayments = 0;
    let totalAllocatedPayments = 0;
    let totalUnallocatedPayments = 0;
    let reversedCount = 0;

    payments.forEach((p) => {
      if (p.reversal) {
        reversedCount += 1;
      } else {
        totalRecordedPayments += Number(p.amount) || 0;
        totalAllocatedPayments += Number(p.allocated_amount) || 0;
        totalUnallocatedPayments += Number(p.unallocated_amount) || 0;
      }
    });

    // Promises
    const activePromises = promises.filter((p) => p.status === "ACTIVE");
    const activePromisesTotal = activePromises.reduce(
      (sum, p) => sum + (Number(p.promised_amount) || 0),
      0
    );

    // Disputes
    const openDisputes = disputes.filter(
      (d) => d.status === "OPEN" || d.status === "UNDER_REVIEW"
    );

    return {
      currency,
      invoicesCount: invoices.length,
      totalInvoiced,
      totalOutstanding,
      totalOverdue,
      totalInvoicesPaid,
      totalRecordedPayments,
      totalAllocatedPayments,
      totalUnallocatedPayments,
      reversedCount,
      activePromisesCount: activePromises.length,
      activePromisesTotal,
      openDisputesCount: openDisputes.length,
    };
  }, [invoices, payments, promises, disputes]);

  // Refresh all customer data
  const handleRefreshAll = () => {
    refetchCustomer();
    refetchInvoices();
    refetchPayments();
    promisesQueries.forEach((q) => q.refetch());
    disputesQueries.forEach((q) => q.refetch());
    messagesQueries.forEach((q) => q.refetch());
    timelineQueries.forEach((q) => q.refetch());
  };

  if (isCustomerLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <Skeleton height={32} width={240} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
        <Skeleton height={400} className="w-full" />
      </div>
    );
  }

  if (isCustomerError || !customer) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div
          role="alert"
          className="bg-status-error-bg border border-status-error/30 rounded-xl p-8 text-center space-y-4"
        >
          <AlertCircle size={36} className="text-status-error mx-auto" />
          <div>
            <h2 className="text-lg font-bold text-text-primary">
              Customer Not Found or Inaccessible
            </h2>
            <p className="text-sm text-text-secondary mt-1 max-w-md mx-auto">
              {(customerError as any)?.message ||
                "Unable to retrieve the specified customer profile. The record may have been removed or belongs to another organization."}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link href="/customers">
              <Button variant="outline" size="sm" leftIcon={<ArrowLeft size={14} />}>
                Back to Directory
              </Button>
            </Link>
            <Button
              variant="primary"
              size="sm"
              onClick={() => refetchCustomer()}
              leftIcon={<RefreshCw size={14} />}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 bg-surface min-h-[calc(100vh-64px)]">
      {/* Top Navigation & Profile Header */}
      <div className="bg-white rounded-xl border border-surface-border p-6 shadow-card space-y-4">
        {/* Back link & Environment mode */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/customers"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-brand transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to Customer Directory</span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant={isDemoMode ? "warning" : "info"}>
              {isDemoMode ? "Demo Mode" : "Live API"}
            </Badge>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleRefreshAll}
              leftIcon={<RefreshCw size={12} />}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Customer Identity Row */}
        <div className="flex flex-wrap items-start justify-between gap-4 pt-1 border-t border-surface-border">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-text-primary tracking-tight">
                {customer.name}
              </h1>
              <Badge variant={customer.is_active ? "success" : "muted"} dot>
                {customer.is_active ? "Active" : "Inactive"}
              </Badge>
              {customer.tax_identifier && (
                <span className="text-xs font-mono bg-surface border border-surface-border px-2 py-0.5 rounded text-text-secondary">
                  TID: {customer.tax_identifier}
                </span>
              )}
            </div>
            <div className="text-xs text-text-muted font-mono flex items-center gap-2">
              <span>Customer ID: {customer.id}</span>
              <span>•</span>
              <span>Registered: {formatDate(customer.created_at)}</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditDialogOpen(true)}
              leftIcon={<Edit2 size={13} />}
            >
              Edit Profile
            </Button>
            <Link href={`/invoices?customer_id=${customer.id}`}>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<FileText size={13} />}
                rightIcon={<ExternalLink size={12} />}
              >
                Invoices ({invoices.length})
              </Button>
            </Link>
            <Link href="/collections">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Receipt size={13} />}
              >
                Collections Workspace
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Authoritative Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Outstanding Balance"
          value={financialTotals.totalOutstanding}
          currency={financialTotals.currency}
          isCurrency
          highlight={financialTotals.totalOutstanding > 0 ? "error" : undefined}
          period="Across loaded invoices"
        />
        <KpiCard
          title="Overdue Amount"
          value={financialTotals.totalOverdue}
          currency={financialTotals.currency}
          isCurrency
          highlight={financialTotals.totalOverdue > 0 ? "warning" : undefined}
          period="Past contractual due date"
        />
        <KpiCard
          title="Recorded Payments"
          value={financialTotals.totalRecordedPayments}
          currency={financialTotals.currency}
          isCurrency
          highlight="success"
          period="Confirmed receipts only"
        />
        <KpiCard
          title="Total Invoiced"
          value={financialTotals.totalInvoiced}
          currency={financialTotals.currency}
          isCurrency
          period={`${financialTotals.invoicesCount} invoice(s)`}
        />
      </div>

      {/* Authoritative Receivables Disclosure Banner */}
      <div className="bg-brand-lavender/40 border border-brand/20 rounded-xl px-4 py-3 text-xs text-text-secondary flex items-start gap-3">
        <HelpCircle size={15} className="text-brand shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <strong className="text-text-primary">Financial & Collection Governance Notice:</strong>
          <p>
            Outstanding and overdue totals are calculated exclusively from canonical invoice records.
            Payment promises and customer dispute claims <em>never</em> reduce outstanding balances or mark invoices as paid.
            Recorded payments reflect confirmed financial receipts only.
          </p>
        </div>
      </div>

      {/* Tabbed Workspace */}
      <div className="bg-white rounded-xl border border-surface-border shadow-card overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="border-b border-surface-border px-6 pt-3">
            <TabsList className="flex flex-wrap gap-2">
              <TabsTrigger value="overview">Overview & Contact</TabsTrigger>
              <TabsTrigger value="invoices" count={invoices.length}>
                Invoices
              </TabsTrigger>
              <TabsTrigger value="payments" count={payments.length}>
                Payments & Allocations
              </TabsTrigger>
              <TabsTrigger value="promises" count={promises.length}>
                Payment Promises
              </TabsTrigger>
              <TabsTrigger value="disputes" count={disputes.length}>
                Disputes
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                count={messages.length + timelineEvents.length}
              >
                Communications & Activity
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6">
            {/* ==================================================== */}
            {/* TAB 1: OVERVIEW & CONTACT                             */}
            {/* ==================================================== */}
            <TabsContent value="overview">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Contact Identity Card */}
                <div className="bg-surface rounded-xl border border-surface-border p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                    <Building2 size={13} className="text-text-muted" />
                    <span>Customer Profile</span>
                  </h3>

                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-2xs text-text-muted uppercase block">
                        Primary Contact
                      </span>
                      <span className="font-medium text-text-primary">
                        {customer.contact_name || "—"}
                      </span>
                    </div>

                    <div>
                      <span className="text-2xs text-text-muted uppercase block">
                        Email Address
                      </span>
                      {customer.email ? (
                        <a
                          href={`mailto:${customer.email}`}
                          className="font-medium text-brand hover:underline flex items-center gap-1.5"
                        >
                          <Mail size={13} className="shrink-0" />
                          <span className="break-all">{customer.email}</span>
                        </a>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </div>

                    <div>
                      <span className="text-2xs text-text-muted uppercase block">
                        Phone Number
                      </span>
                      {customer.phone ? (
                        <a
                          href={`tel:${customer.phone}`}
                          className="font-medium text-text-primary hover:text-brand flex items-center gap-1.5"
                        >
                          <Phone size={13} className="shrink-0" />
                          <span>{customer.phone}</span>
                        </a>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </div>

                    <div>
                      <span className="text-2xs text-text-muted uppercase block">
                        Tax Identifier
                      </span>
                      <span className="font-mono text-xs text-text-primary">
                        {customer.tax_identifier || "—"}
                      </span>
                    </div>

                    <div>
                      <span className="text-2xs text-text-muted uppercase block">
                        Billing Address
                      </span>
                      {customer.billing_address ? (
                        <div className="flex items-start gap-1.5 text-text-secondary text-xs mt-0.5">
                          <MapPin size={13} className="text-text-muted shrink-0 mt-0.5" />
                          <span>{customer.billing_address}</span>
                        </div>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-surface-border">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setIsEditDialogOpen(true)}
                      className="w-full"
                    >
                      Edit Customer Profile
                    </Button>
                  </div>
                </div>

                {/* Financial Summary & Receivables Health */}
                <div className="md:col-span-2 space-y-4">
                  <div className="bg-surface rounded-xl border border-surface-border p-5 space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      Accounts Receivable Position
                    </h3>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-surface-border">
                        <span className="text-2xs text-text-muted uppercase block mb-1">
                          Total Invoiced
                        </span>
                        <CurrencyDisplay
                          amount={financialTotals.totalInvoiced}
                          currency={financialTotals.currency}
                          size="lg"
                        />
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-surface-border">
                        <span className="text-2xs text-text-muted uppercase block mb-1">
                          Recorded Receipts
                        </span>
                        <CurrencyDisplay
                          amount={financialTotals.totalRecordedPayments}
                          currency={financialTotals.currency}
                          size="lg"
                        />
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-surface-border">
                        <span className="text-2xs text-text-muted uppercase block mb-1">
                          Outstanding Balance
                        </span>
                        <CurrencyDisplay
                          amount={financialTotals.totalOutstanding}
                          currency={financialTotals.currency}
                          size="lg"
                          negative={financialTotals.totalOutstanding > 0}
                        />
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-surface-border">
                        <span className="text-2xs text-text-muted uppercase block mb-1">
                          Allocated Payments
                        </span>
                        <CurrencyDisplay
                          amount={financialTotals.totalAllocatedPayments}
                          currency={financialTotals.currency}
                          size="md"
                        />
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-surface-border">
                        <span className="text-2xs text-text-muted uppercase block mb-1">
                          Unallocated Payments
                        </span>
                        <CurrencyDisplay
                          amount={financialTotals.totalUnallocatedPayments}
                          currency={financialTotals.currency}
                          size="md"
                        />
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-surface-border">
                        <span className="text-2xs text-text-muted uppercase block mb-1">
                          Reversed Payments
                        </span>
                        <span className="text-sm font-semibold text-text-primary">
                          {financialTotals.reversedCount} transaction(s)
                        </span>
                      </div>
                    </div>

                    {/* Commitments & Disputes Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="bg-white p-4 rounded-lg border border-surface-border flex items-center justify-between">
                        <div>
                          <span className="text-2xs text-text-muted uppercase block">
                            Active Payment Promises
                          </span>
                          <span className="text-sm font-semibold text-text-primary">
                            {financialTotals.activePromisesCount} promise(s)
                          </span>
                          <div className="text-2xs text-text-secondary mt-0.5">
                            Total Promised:{" "}
                            <CurrencyDisplay
                              amount={financialTotals.activePromisesTotal}
                              currency={financialTotals.currency}
                              size="sm"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setActiveTab("promises")}
                        >
                          View
                        </Button>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-surface-border flex items-center justify-between">
                        <div>
                          <span className="text-2xs text-text-muted uppercase block">
                            Active Invoiced Disputes
                          </span>
                          <span className="text-sm font-semibold text-text-primary">
                            {financialTotals.openDisputesCount} open dispute(s)
                          </span>
                          <div className="text-2xs text-text-secondary mt-0.5">
                            Requires operational review
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setActiveTab("disputes")}
                        >
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ==================================================== */}
            {/* TAB 2: INVOICES                                      */}
            {/* ==================================================== */}
            <TabsContent value="invoices">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-text-secondary">
                    Displaying canonical invoices issued to <strong>{customer.name}</strong>.
                  </div>
                  <Link href={`/invoices?customer_id=${customer.id}`}>
                    <Button variant="outline" size="xs" rightIcon={<ExternalLink size={12} />}>
                      Open in Invoices Directory
                    </Button>
                  </Link>
                </div>

                <div className="bg-white rounded-lg border border-surface-border overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-border bg-surface text-2xs font-semibold text-text-secondary uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium">Invoice Number</th>
                        <th className="px-4 py-3 font-medium">Issue Date</th>
                        <th className="px-4 py-3 font-medium">Due Date</th>
                        <th className="px-4 py-3 font-medium text-right">Total Amount</th>
                        <th className="px-4 py-3 font-medium text-right">Paid</th>
                        <th className="px-4 py-3 font-medium text-right">Outstanding</th>
                        <th className="px-4 py-3 font-medium">Payment Status</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border text-sm">
                      {isInvoicesLoading ? (
                        Array.from({ length: 3 }).map((_, idx) => (
                          <tr key={`inv-skeleton-${idx}`}>
                            <td colSpan={8} className="px-4 py-4">
                              <Skeleton height={20} className="w-full" />
                            </td>
                          </tr>
                        ))
                      ) : invoices.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8">
                            <EmptyState
                              icon={FileText}
                              title="No invoices found"
                              description="No invoices have been issued to this customer yet."
                            />
                          </td>
                        </tr>
                      ) : (
                        invoices.map((inv) => (
                          <tr
                            key={inv.invoice_id}
                            className="hover:bg-surface/50 transition-colors"
                          >
                            <td className="px-4 py-3 font-medium text-text-primary">
                              <Link
                                href={`/invoices/${inv.invoice_id}`}
                                className="text-brand hover:underline flex items-center gap-1"
                              >
                                {inv.invoice_number}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary">
                              {inv.issue_date ? formatDateShort(inv.issue_date) : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary">
                              {inv.due_date ? formatDateShort(inv.due_date) : "—"}
                              {inv.days_overdue > 0 && (
                                <span className="ml-1 text-2xs text-status-error font-medium">
                                  ({inv.days_overdue}d overdue)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <CurrencyDisplay
                                amount={inv.total_amount}
                                currency={inv.currency}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <CurrencyDisplay
                                amount={inv.paid_amount}
                                currency={inv.currency}
                                muted={Number(inv.paid_amount) === 0}
                              />
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              <CurrencyDisplay
                                amount={inv.outstanding_amount}
                                currency={inv.currency}
                                negative={Number(inv.outstanding_amount) > 0}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                type="invoice"
                                status={inv.payment_status}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link href={`/invoices/${inv.invoice_id}`}>
                                <Button variant="ghost" size="xs">
                                  View Details
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ==================================================== */}
            {/* TAB 3: PAYMENTS & ALLOCATIONS                        */}
            {/* ==================================================== */}
            <TabsContent value="payments">
              <div className="space-y-4">
                <div className="bg-surface border border-surface-border rounded-lg p-3 text-xs text-text-secondary flex items-start gap-2">
                  <CreditCard size={15} className="text-text-muted shrink-0 mt-0.5" />
                  <div>
                    <strong>Confirmed Financial Receipts:</strong> This ledger displays actual banking transactions recorded for this customer.
                    Payment promises and customer claims are <em>not</em> treated as payments.
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-surface-border overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-border bg-surface text-2xs font-semibold text-text-secondary uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium">Payment Date</th>
                        <th className="px-4 py-3 font-medium">Reference</th>
                        <th className="px-4 py-3 font-medium">Method</th>
                        <th className="px-4 py-3 font-medium text-right">Amount</th>
                        <th className="px-4 py-3 font-medium text-right">Allocated</th>
                        <th className="px-4 py-3 font-medium text-right">Unallocated</th>
                        <th className="px-4 py-3 font-medium">Allocation Status</th>
                        <th className="px-4 py-3 font-medium">Allocations Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border text-sm">
                      {isPaymentsLoading ? (
                        Array.from({ length: 3 }).map((_, idx) => (
                          <tr key={`pay-skeleton-${idx}`}>
                            <td colSpan={8} className="px-4 py-4">
                              <Skeleton height={20} className="w-full" />
                            </td>
                          </tr>
                        ))
                      ) : payments.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8">
                            <EmptyState
                              icon={CreditCard}
                              title="No payments recorded"
                              description="No payments or remittances have been recorded for this customer."
                            />
                          </td>
                        </tr>
                      ) : (
                        payments.map((p) => {
                          const isReversed = Boolean(p.reversal);
                          const isFullyAllocated =
                            !isReversed && Number(p.unallocated_amount) === 0;
                          const isPartial =
                            !isReversed &&
                            Number(p.allocated_amount) > 0 &&
                            Number(p.unallocated_amount) > 0;
                          const isUnallocated =
                            !isReversed && Number(p.allocated_amount) === 0;

                          return (
                            <tr
                              key={p.id}
                              className={clsx(
                                "hover:bg-surface/50 transition-colors",
                                isReversed && "bg-status-error-bg/30 opacity-80"
                              )}
                            >
                              <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                                {formatDateShort(p.payment_date)}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-text-primary">
                                {p.reference || "—"}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                <Badge variant="default">
                                  {p.payment_method}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-right font-medium">
                                <CurrencyDisplay
                                  amount={p.amount}
                                  currency={p.currency}
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <CurrencyDisplay
                                  amount={p.allocated_amount}
                                  currency={p.currency}
                                  muted={Number(p.allocated_amount) === 0}
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <CurrencyDisplay
                                  amount={p.unallocated_amount}
                                  currency={p.currency}
                                  muted={Number(p.unallocated_amount) === 0}
                                />
                              </td>
                              <td className="px-4 py-3">
                                {isReversed ? (
                                  <Badge variant="error">
                                    REVERSED
                                  </Badge>
                                ) : isFullyAllocated ? (
                                  <Badge variant="success">
                                    FULLY ALLOCATED
                                  </Badge>
                                ) : isPartial ? (
                                  <Badge variant="warning">
                                    PARTIAL
                                  </Badge>
                                ) : (
                                  <Badge variant="info">
                                    UNALLOCATED
                                  </Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-text-secondary">
                                {isReversed ? (
                                  <div className="text-status-error">
                                    Reversed: {p.reversal?.reason || "Administrative correction"} (
                                    {p.reversal?.reversed_at
                                      ? formatDateShort(p.reversal.reversed_at)
                                      : "reversal logged"}
                                    )
                                  </div>
                                ) : p.allocations && p.allocations.length > 0 ? (
                                  <div className="space-y-1">
                                    {p.allocations.map((alloc) => {
                                      const matchedInv = invoiceMap.get(alloc.invoice_id);
                                      return (
                                        <div
                                          key={alloc.id}
                                          className="flex items-center gap-1.5 font-mono text-2xs"
                                        >
                                          <span>→</span>
                                          <Link
                                            href={`/invoices/${alloc.invoice_id}`}
                                            className="text-brand hover:underline font-semibold"
                                          >
                                            {matchedInv?.invoice_number || alloc.invoice_id.substring(0, 8)}
                                          </Link>
                                          <span>:</span>
                                          <CurrencyDisplay
                                            amount={alloc.amount}
                                            currency={p.currency}
                                            size="sm"
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-text-muted">No allocations</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ==================================================== */}
            {/* TAB 4: PAYMENT PROMISES                              */}
            {/* ==================================================== */}
            <TabsContent value="promises">
              <div className="space-y-4">
                <div className="bg-surface border border-surface-border rounded-lg p-3 text-xs text-text-secondary flex items-start gap-2">
                  <Clock size={15} className="text-text-muted shrink-0 mt-0.5" />
                  <div>
                    <strong>Payment Promise Governance:</strong> A payment promise represents a debtor commitment to settle by a scheduled date.
                    Promises <em>never</em> reduce the invoice outstanding balance or mark an invoice as paid until an actual payment is received and allocated.
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-surface-border overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-border bg-surface text-2xs font-semibold text-text-secondary uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium">Invoice Number</th>
                        <th className="px-4 py-3 font-medium text-right">Promised Amount</th>
                        <th className="px-4 py-3 font-medium">Expected Payment Date</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Notes / Justification</th>
                        <th className="px-4 py-3 font-medium">Created Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border text-sm">
                      {promises.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8">
                            <EmptyState
                              icon={Clock}
                              title="No payment promises found"
                              description="No payment commitments have been recorded on this customer's invoices."
                            />
                          </td>
                        </tr>
                      ) : (
                        promises.map((prom) => (
                          <tr
                            key={prom.id}
                            className="hover:bg-surface/50 transition-colors"
                          >
                            <td className="px-4 py-3 font-medium text-text-primary">
                              <Link
                                href={`/invoices/${prom.invoice_id}`}
                                className="text-brand hover:underline"
                              >
                                {prom.invoiceNumber || prom.invoice_id}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              <CurrencyDisplay
                                amount={prom.promised_amount}
                                currency={prom.currency || financialTotals.currency}
                              />
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary">
                              {formatDate(prom.expected_payment_date)}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                type="promise"
                                status={prom.status}
                                dot
                              />
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary max-w-xs truncate">
                              {prom.notes || "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary">
                              {formatDateShort(prom.created_at)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ==================================================== */}
            {/* TAB 5: DISPUTES                                      */}
            {/* ==================================================== */}
            <TabsContent value="disputes">
              <div className="space-y-4">
                <div className="bg-surface border border-surface-border rounded-lg p-3 text-xs text-text-secondary flex items-start gap-2">
                  <ShieldAlert size={15} className="text-text-muted shrink-0 mt-0.5" />
                  <div>
                    <strong>Dispute Verification:</strong> Customer claims and disputes flag invoices currently under operational dispute.
                    Registering a dispute does <em>not</em> reduce outstanding receivables until formal resolution or credit adjustment occurs.
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-surface-border overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-border bg-surface text-2xs font-semibold text-text-secondary uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium">Invoice Number</th>
                        <th className="px-4 py-3 font-medium">Category</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Description</th>
                        <th className="px-4 py-3 font-medium">Resolution Notes</th>
                        <th className="px-4 py-3 font-medium">Dates</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border text-sm">
                      {disputes.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8">
                            <EmptyState
                              icon={ShieldAlert}
                              title="No disputes recorded"
                              description="No open or resolved disputes exist on this customer's invoices."
                            />
                          </td>
                        </tr>
                      ) : (
                        disputes.map((disp) => (
                          <tr
                            key={disp.id}
                            className="hover:bg-surface/50 transition-colors"
                          >
                            <td className="px-4 py-3 font-medium text-text-primary">
                              <Link
                                href={`/invoices/${disp.invoice_id}`}
                                className="text-brand hover:underline"
                              >
                                {disp.invoiceNumber || disp.invoice_id}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <Badge variant="muted">
                                {disp.category}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                type="dispute"
                                status={disp.status}
                                dot
                              />
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary max-w-sm truncate">
                              {disp.description}
                            </td>
                            <td className="px-4 py-3 text-xs text-text-secondary max-w-xs truncate">
                              {disp.resolution_notes || "—"}
                            </td>
                            <td className="px-4 py-3 text-2xs text-text-secondary space-y-0.5">
                              <div>Opened: {formatDateShort(disp.created_at)}</div>
                              {disp.resolved_at && (
                                <div className="text-status-success font-medium">
                                  Resolved: {formatDateShort(disp.resolved_at)}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ==================================================== */}
            {/* TAB 6: COMMUNICATIONS & ACTIVITY                     */}
            {/* ==================================================== */}
            <TabsContent value="activity">
              <div className="space-y-6">
                <div className="bg-surface border border-surface-border rounded-lg p-3 text-xs text-text-secondary flex items-start gap-2">
                  <History size={15} className="text-text-muted shrink-0 mt-0.5" />
                  <div>
                    <strong>Invoice-Scoped Consolidated Activity:</strong> Activity logs are consolidated transparently from verified invoice communication and timeline endpoints for this customer.
                    The backend does not support an unverified global customer timeline endpoint.
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Messages Section */}
                  <div className="bg-surface rounded-xl border border-surface-border p-5 space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MessageSquare size={14} className="text-text-muted" />
                        <span>Communications ({messages.length})</span>
                      </span>
                    </h3>

                    {messages.length === 0 ? (
                      <EmptyState
                        icon={MessageSquare}
                        title="No messages"
                        description="No inbound or outbound collection messages logged for customer invoices."
                      />
                    ) : (
                      <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                        {messages.map((msg) => (
                          <div
                            key={msg.id}
                            className="bg-white rounded-lg border border-surface-border p-3 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-medium text-text-primary">
                                <Badge
                                  variant={msg.direction === "INBOUND" ? "info" : "purple"}
                                >
                                  {msg.direction}
                                </Badge>
                                <span>{msg.channel}</span>
                                <span className="text-text-muted font-normal">
                                  on Invoice {msg.invoiceNumber}
                                </span>
                              </div>
                              <span className="text-2xs text-text-muted">
                                {formatDateTime(msg.sent_at || msg.created_at)}
                              </span>
                            </div>

                            {msg.subject && (
                              <div className="font-semibold text-text-primary">
                                {msg.subject}
                              </div>
                            )}

                            <p className="text-text-secondary text-2xs leading-relaxed line-clamp-3">
                              {msg.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timeline Events Section */}
                  <div className="bg-surface rounded-xl border border-surface-border p-5 space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <History size={14} className="text-text-muted" />
                        <span>Timeline Events ({timelineEvents.length})</span>
                      </span>
                    </h3>

                    {timelineEvents.length === 0 ? (
                      <EmptyState
                        icon={History}
                        title="No timeline events"
                        description="No audit or timeline events recorded across customer invoices."
                      />
                    ) : (
                      <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                        {timelineEvents.map((ev, idx) => {
                          const dateStr = ev.created_at || ev.occurred_at;
                          return (
                            <div
                              key={ev.id || `timeline-${idx}`}
                              className="bg-white rounded-lg border border-surface-border p-3 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-text-primary">
                                  {ev.title || ev.event_type}
                                </span>
                                <span className="text-2xs text-text-muted">
                                  {dateStr ? formatDateTime(dateStr) : "—"}
                                </span>
                              </div>
                              <div className="text-text-secondary text-2xs">
                                {ev.description}
                              </div>
                              <div className="text-2xs text-text-muted font-mono">
                                Invoice: {ev.invoiceNumber}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Edit Customer Dialog */}
      <CustomerFormDialog
        isOpen={isEditDialogOpen}
        customer={customer}
        onClose={() => setIsEditDialogOpen(false)}
        onSuccess={() => refetchCustomer()}
      />
    </div>
  );
}
