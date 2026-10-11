"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { receivablesApi } from "@/lib/api/receivables.api";
import { paymentsApi } from "@/lib/api/payments.api";
import { customersApi } from "@/lib/api/customers.api";
import { collectionsApi } from "@/lib/api/collections.api";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import {
  BarChart3,
  PieChart,
  Activity,
  Download,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
  ArrowRight,
  CreditCard,
  FileText,
  Search,
  Filter,
  ExternalLink,
  Target,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDemoMode } from "@/providers/DemoModeProvider";
import { formatDateShort } from "@/lib/formatting/dates";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgingBucket } from "@/types/receivables";

type ReportTab = "aging" | "ledger" | "payments" | "performance";

const BUCKET_LABELS: Record<string, { label: string; desc: string; color: string; badgeVariant: "success" | "warning" | "error" | "default" | "purple" }> = {
  NOT_DUE: { label: "Current (Not Due)", desc: "Invoices within credit terms", color: "#6D43D9", badgeVariant: "purple" },
  "1_30": { label: "1-30 Days", desc: "Recently overdue (low risk)", color: "#EAB308", badgeVariant: "warning" },
  "31_60": { label: "31-60 Days", desc: "Follow-up required (medium risk)", color: "#F97316", badgeVariant: "warning" },
  "61_90": { label: "61-90 Days", desc: "Critical aging (high risk)", color: "#EF4444", badgeVariant: "error" },
  "90_PLUS": { label: "90+ Days", desc: "Severe delinquency / doubtful", color: "#B91C1C", badgeVariant: "error" },
};

export default function ReportsPage() {
  const router = useRouter();
  const { isDemoMode } = useDemoMode();

  const [activeTab, setActiveTab] = useState<ReportTab>("aging");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("INR");

  // Ledger filters
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerBucket, setLedgerBucket] = useState<string>("ALL");
  const [ledgerStatus, setLedgerStatus] = useState<string>("ALL");

  // Receivables Summary Query
  const {
    data: summary = [],
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["receivables-summary"],
    queryFn: () => receivablesApi.getSummary(),
  });

  // Receivables Aging Query
  const {
    data: aging = [],
    isLoading: isAgingLoading,
    isError: isAgingError,
    error: agingError,
    refetch: refetchAging,
  } = useQuery({
    queryKey: ["receivables-aging"],
    queryFn: () => receivablesApi.getAging(),
  });

  // Receivables Invoices Ledger Query
  const {
    data: invoices = [],
    isLoading: isInvoicesLoading,
    isError: isInvoicesError,
    error: invoicesError,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ["receivables-invoices-ledger"],
    queryFn: () => receivablesApi.getInvoices({ limit: 100 }),
  });

  // Payments Query
  const {
    data: payments = [],
    isLoading: isPaymentsLoading,
    isError: isPaymentsError,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ["reports-payments"],
    queryFn: () => paymentsApi.listPayments({ limit: 100 }),
  });

  // Customer Directory Query
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-directory"],
    queryFn: () => customersApi.list({ limit: 100 }),
    staleTime: 60000,
  });

  // Collections Promises (demo only)
  const { data: promises = [] } = useQuery({
    queryKey: ["collections-promises-report"],
    queryFn: () => collectionsApi.listAllPromises(),
    enabled: isDemoMode,
  });

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => {
      map.set(c.id, c.name);
    });
    return map;
  }, [customers]);

  // Available currencies across returned summaries
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    summary.forEach((s) => set.add(s.currency));
    aging.forEach((a) => set.add(a.currency));
    invoices.forEach((i) => set.add(i.currency));
    return Array.from(set);
  }, [summary, aging, invoices]);

  // Main summary for selected currency (or fallback)
  const activeCurrency = availableCurrencies.includes(selectedCurrency)
    ? selectedCurrency
    : availableCurrencies[0] || "INR";

  const currentSummary = useMemo(() => {
    return summary.find((s) => s.currency === activeCurrency) || summary[0] || null;
  }, [summary, activeCurrency]);

  const currentAging = useMemo(() => {
    return aging.find((a) => a.currency === activeCurrency) || aging[0] || null;
  }, [aging, activeCurrency]);

  // Total outstanding in current aging report
  const totalAgingOutstanding = useMemo(() => {
    if (!currentAging) return 0;
    return currentAging.buckets.reduce((sum, b) => sum + Number(b.outstanding_amount), 0);
  }, [currentAging]);

  // Payments aggregation
  const paymentsMetrics = useMemo(() => {
    let recorded = 0;
    let allocated = 0;
    let unallocated = 0;
    let reversed = 0;

    payments.forEach((p) => {
      if (p.reversal) {
        reversed += Number(p.amount);
      } else {
        recorded += Number(p.amount);
        allocated += Number(p.allocated_amount);
        unallocated += Number(p.unallocated_amount);
      }
    });

    return { recorded, allocated, unallocated, reversed };
  }, [payments]);

  // Filtered invoices for Ledger Tab
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (ledgerBucket !== "ALL" && inv.aging_bucket !== ledgerBucket) return false;
      if (ledgerStatus !== "ALL" && inv.payment_status !== ledgerStatus) return false;
      if (ledgerSearch.trim()) {
        const term = ledgerSearch.toLowerCase();
        const numMatch = inv.invoice_number.toLowerCase().includes(term);
        const custIdMatch = inv.customer_id.toLowerCase().includes(term);
        const custNameMatch = customerMap.get(inv.customer_id)?.toLowerCase().includes(term);
        if (!numMatch && !custIdMatch && !custNameMatch) return false;
      }
      return true;
    });
  }, [invoices, ledgerBucket, ledgerStatus, ledgerSearch, customerMap]);

  // Retry all queries on error
  const handleRetryAll = () => {
    refetchSummary();
    refetchAging();
    refetchInvoices();
    refetchPayments();
  };

  const hasAnyError = isSummaryError || isAgingError || isInvoicesError;

  // RFC 4180 compliant CSV export
  const handleExport = () => {
    if (!currentAging && invoices.length === 0) return;

    const escapeCsv = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows: (string | number)[][] = [
      ["ACCO Financial Receivables & Intelligence Report"],
      ["Generated At", new Date().toISOString()],
      ["Environment", isDemoMode ? "DEMO DATA (NON-LEGAL AUDIT)" : "LIVE VERIFIED LEDGER"],
      ["Active Currency", activeCurrency],
      [],
      ["--- SECTION 1: EXECUTIVE RECEIVABLES SUMMARY ---"],
      ["Metric", "Value", "Currency / Scope"],
      ["Total Issued Invoices Volume", currentSummary?.total_issued_amount ?? 0, activeCurrency],
      ["Allocated / Issued Portfolio", currentSummary?.total_allocated_amount ?? 0, activeCurrency],
      [
        "Allocated / Issued Portfolio Ratio",
        currentSummary && Number(currentSummary.total_issued_amount) > 0
          ? `${((Number(currentSummary.total_allocated_amount) / Number(currentSummary.total_issued_amount)) * 100).toFixed(2)}%`
          : "0.00%",
        "Recorded allocations as a share of issued invoice value. This is a cumulative portfolio ratio, not a period-specific collection rate.",
      ],
      ["Total Outstanding Receivables", currentSummary?.total_outstanding_amount ?? 0, activeCurrency],
      ["Active Invoices Count", currentSummary?.invoices_count ?? 0, "Invoices"],
      ["Overdue Invoices Count", currentSummary?.overdue_invoices_count ?? 0, "Invoices"],
      ["Total Overdue Receivables", currentSummary?.total_overdue_amount ?? 0, activeCurrency],
      [],
      ["--- SECTION 2: RECEIVABLES AGING DISTRIBUTION ---"],
      ["Currency", "Aging Bucket", "Bucket Description", "Outstanding Amount", "Invoices Count", "Share of Total Outstanding"],
    ];

    if (currentAging) {
      currentAging.buckets.forEach((bucket) => {
        const bucketMeta = BUCKET_LABELS[bucket.bucket] || { label: bucket.bucket, desc: "" };
        const share =
          totalAgingOutstanding > 0
            ? `${((Number(bucket.outstanding_amount) / totalAgingOutstanding) * 100).toFixed(2)}%`
            : "0.00%";
        rows.push([
          currentAging.currency,
          bucket.bucket,
          bucketMeta.label,
          bucket.outstanding_amount,
          bucket.outstanding_invoices_count,
          share,
        ]);
      });
    }

    rows.push([]);
    rows.push(["--- SECTION 3: INVOICE RECEIVABLES LEDGER ---"]);
    rows.push([
      "Invoice Number",
      "Customer Name",
      "Customer ID",
      "Currency",
      "Issue Date",
      "Due Date",
      "Days Overdue",
      "Total Amount",
      "Paid / Allocated",
      "Outstanding Balance",
      "Payment Status",
      "Aging Bucket",
    ]);

    invoices.forEach((inv) => {
      const cName = customerMap.get(inv.customer_id) || "Unknown Customer";
      rows.push([
        inv.invoice_number,
        cName,
        inv.customer_id,
        inv.currency,
        inv.issue_date || "",
        inv.due_date || "",
        inv.days_overdue,
        inv.total_amount,
        inv.paid_amount,
        inv.outstanding_amount,
        inv.payment_status,
        inv.aging_bucket,
      ]);
    });

    const csvContent = rows
      .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
      .join("\r\n");

    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `acco-receivables-report-${activeCurrency.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-surface overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-6 rounded-xl border border-surface-border shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            Reports & Analytics
            {!isDemoMode ? (
              <Badge variant="success">Live API</Badge>
            ) : (
              <Badge variant="info">Demo Mode</Badge>
            )}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Authoritative receivables intelligence, aging distribution, and reconciliation audit ledgers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Currency Switcher */}
          {availableCurrencies.length > 1 && (
            <div className="flex items-center gap-1.5 bg-surface border border-surface-border rounded-lg p-1 text-xs">
              <span className="text-text-secondary font-medium px-2">Currency:</span>
              {availableCurrencies.map((curr) => (
                <button
                  key={curr}
                  onClick={() => setSelectedCurrency(curr)}
                  className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                    activeCurrency === curr
                      ? "bg-white text-brand shadow-xs border border-surface-border"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>
          )}

          <Button
            onClick={handleExport}
            variant="outline"
            size="md"
            disabled={isAgingLoading && isInvoicesLoading}
            leftIcon={<Download size={16} />}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Accounting Invariant Notice Banner */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-3 text-xs text-blue-900 shadow-xs">
        <ShieldAlert size={18} className="shrink-0 text-brand mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold block">Authoritative Reporting Invariant:</span>
          <span>
            Reported values reflect canonical issued invoices and verified recorded cash receipts. Debtor payment promises and correspondence represent debtor intentions and do not adjust balance ledgers until payments are recorded and allocated.
          </span>
        </div>
      </div>

      {/* Error Banner with Retry */}
      {hasAnyError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-error/30 bg-status-error-bg p-4 text-sm text-status-error shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} className="shrink-0" />
            <div>
              <strong className="font-semibold block">Error Loading Report Data:</strong>
              <span>
                {summaryError?.message || agingError?.message || invoicesError?.message || "Check your backend connection and retry."}
              </span>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={handleRetryAll} leftIcon={<RefreshCw size={14} />}>
            Retry
          </Button>
        </div>
      )}

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Outstanding */}
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
              Total Outstanding
            </span>
            <span className="text-[11px] text-text-muted">Current Portfolio</span>
          </div>
          <div className="mt-2">
            {isSummaryLoading ? (
              <div className="h-7 w-24 bg-surface animate-pulse rounded" />
            ) : currentSummary ? (
              <CurrencyDisplay
                amount={currentSummary.total_outstanding_amount}
                currency={currentSummary.currency}
                size="xl"
                className="font-bold text-text-primary"
              />
            ) : (
              <span className="text-text-muted text-sm">—</span>
            )}
          </div>
          <span className="text-xs text-text-secondary mt-1 block">
            Across {currentSummary?.invoices_count || 0} active invoices
          </span>
        </div>

        {/* Overdue Amount */}
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
              Overdue Receivables
            </span>
            <Badge variant="error">Past Due</Badge>
          </div>
          <div className="mt-2">
            {isSummaryLoading ? (
              <div className="h-7 w-24 bg-surface animate-pulse rounded" />
            ) : currentSummary ? (
              <CurrencyDisplay
                amount={currentSummary.total_overdue_amount}
                currency={currentSummary.currency}
                size="xl"
                className="font-bold text-status-error"
              />
            ) : (
              <span className="text-text-muted text-sm">—</span>
            )}
          </div>
          <span className="text-xs text-text-secondary mt-1 block">
            {currentSummary?.overdue_invoices_count || 0} overdue invoice(s)
          </span>
        </div>

        {/* Allocated / Issued Portfolio */}
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
              Allocated / Issued Portfolio
            </span>
            <Badge variant="success">Allocated Cash</Badge>
          </div>
          <div className="mt-2">
            {isSummaryLoading ? (
              <div className="h-7 w-24 bg-surface animate-pulse rounded" />
            ) : currentSummary ? (
              <CurrencyDisplay
                amount={currentSummary.total_allocated_amount}
                currency={currentSummary.currency}
                size="xl"
                className="font-semibold text-text-secondary"
              />
            ) : (
              <span className="text-text-muted text-sm">—</span>
            )}
          </div>
          <div className="mt-1 space-y-0.5">
            <span className="text-xs font-semibold text-text-primary block">
              {currentSummary && Number(currentSummary.total_issued_amount) > 0
                ? `${((Number(currentSummary.total_allocated_amount) / Number(currentSummary.total_issued_amount)) * 100).toFixed(1)}% of issued value`
                : "No issued volume"}
            </span>
            <p
              className="text-[11px] text-text-secondary leading-snug"
              title="Recorded allocations as a share of issued invoice value. This is a cumulative portfolio ratio, not a period-specific collection rate."
            >
              Recorded allocations as a share of issued invoice value. This is a cumulative portfolio ratio, not a period-specific collection rate.
            </p>
          </div>
        </div>

        {/* Total Issued Portfolio */}
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
              Total Issued Portfolio
            </span>
            <span className="text-[11px] text-text-muted">Cumulative</span>
          </div>
          <div className="mt-2">
            {isSummaryLoading ? (
              <div className="h-7 w-24 bg-surface animate-pulse rounded" />
            ) : currentSummary ? (
              <CurrencyDisplay
                amount={currentSummary.total_issued_amount}
                currency={currentSummary.currency}
                size="xl"
                className="font-bold text-text-primary"
              />
            ) : (
              <span className="text-text-muted text-sm">—</span>
            )}
          </div>
          <span className="text-xs text-text-secondary mt-1 block">
            Active Issued Receivables
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-surface-border flex items-center gap-2">
        <button
          onClick={() => setActiveTab("aging")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "aging"
              ? "border-brand text-brand"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          <PieChart size={16} />
          Aging Distribution & Buckets
        </button>

        <button
          onClick={() => setActiveTab("ledger")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "ledger"
              ? "border-brand text-brand"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          <FileText size={16} />
          Invoice Receivables Ledger ({invoices.length})
        </button>

        <button
          onClick={() => setActiveTab("payments")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "payments"
              ? "border-brand text-brand"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          <CreditCard size={16} />
          Payment Receipts & Cash Flow
        </button>

        <button
          onClick={() => setActiveTab("performance")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "performance"
              ? "border-brand text-brand"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          <Activity size={16} />
          Collection Performance
          <Badge variant="warning" className="text-[10px] ml-1">Demo</Badge>
        </button>
      </div>

      {/* TAB 1: AGING DISTRIBUTION */}
      {activeTab === "aging" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-surface-border p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-border pb-4">
              <div>
                <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <BarChart3 size={18} className="text-brand" />
                  Receivables Aging Distribution ({activeCurrency})
                </h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Portfolio risk segmentation by canonical days overdue. Click any bucket to open matching invoices.
                </p>
              </div>
              <span className="text-xs font-medium text-text-secondary">
                Total Aging Outstanding:{" "}
                <CurrencyDisplay amount={totalAgingOutstanding} currency={activeCurrency} className="font-bold text-text-primary" />
              </span>
            </div>

            {isAgingLoading ? (
              <div className="py-12 text-center text-sm text-text-muted">Loading aging distribution...</div>
            ) : currentAging && currentAging.buckets.length > 0 ? (
              <div className="space-y-6">
                {/* Visual Distribution Stacked Progress Bar */}
                <div className="space-y-2">
                  <div className="h-6 w-full bg-surface rounded-lg overflow-hidden flex shadow-inner">
                    {currentAging.buckets.map((b) => {
                      const sharePct = totalAgingOutstanding > 0 ? (Number(b.outstanding_amount) / totalAgingOutstanding) * 100 : 0;
                      if (sharePct <= 0) return null;
                      const meta = BUCKET_LABELS[b.bucket] || { color: "#6D43D9", label: b.bucket };
                      return (
                        <div
                          key={b.bucket}
                          style={{ width: `${sharePct}%`, backgroundColor: meta.color }}
                          className="h-full transition-all duration-300 relative group cursor-pointer hover:opacity-90"
                          onClick={() => router.push(`/collections?bucket=${b.bucket}`)}
                          title={`${meta.label}: ${sharePct.toFixed(1)}%`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center justify-between text-xs text-text-secondary gap-2 pt-1">
                    {currentAging.buckets.map((b) => {
                      const meta = BUCKET_LABELS[b.bucket] || { color: "#6D43D9", label: b.bucket };
                      const sharePct = totalAgingOutstanding > 0 ? (Number(b.outstanding_amount) / totalAgingOutstanding) * 100 : 0;
                      return (
                        <div
                          key={b.bucket}
                          onClick={() => router.push(`/collections?bucket=${b.bucket}`)}
                          className="flex items-center gap-1.5 cursor-pointer hover:text-text-primary"
                        >
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                          <span className="font-medium">{meta.label}:</span>
                          <span className="font-mono text-[11px]">{sharePct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Aging Detailed Table */}
                <div className="border border-surface-border rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium">Aging Bucket</th>
                        <th className="px-4 py-3 font-medium">Classification</th>
                        <th className="px-4 py-3 font-medium text-center">Invoices</th>
                        <th className="px-4 py-3 font-medium text-right">Outstanding Amount</th>
                        <th className="px-4 py-3 font-medium text-right">Share of Portfolio</th>
                        <th className="px-4 py-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {currentAging.buckets.map((bucket) => {
                        const meta = BUCKET_LABELS[bucket.bucket] || {
                          label: bucket.bucket,
                          desc: "Aging period",
                          badgeVariant: "default",
                        };
                        const share =
                          totalAgingOutstanding > 0
                            ? ((Number(bucket.outstanding_amount) / totalAgingOutstanding) * 100).toFixed(2) + "%"
                            : "0.00%";

                        return (
                          <tr
                            key={bucket.bucket}
                            onClick={() => router.push(`/collections?bucket=${bucket.bucket}`)}
                            className="hover:bg-surface/50 transition-colors cursor-pointer group"
                          >
                            <td className="px-4 py-3.5 align-middle">
                              <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                            </td>
                            <td className="px-4 py-3.5 align-middle text-xs text-text-secondary">
                              {meta.desc}
                            </td>
                            <td className="px-4 py-3.5 align-middle text-center font-medium">
                              {bucket.outstanding_invoices_count}
                            </td>
                            <td className="px-4 py-3.5 align-middle text-right font-mono font-semibold">
                              <CurrencyDisplay
                                amount={bucket.outstanding_amount}
                                currency={currentAging.currency}
                                className={bucket.bucket !== "NOT_DUE" && Number(bucket.outstanding_amount) > 0 ? "text-status-error" : "text-text-primary"}
                              />
                            </td>
                            <td className="px-4 py-3.5 align-middle text-right font-mono text-text-secondary">
                              {share}
                            </td>
                            <td className="px-4 py-3.5 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/collections?bucket=${bucket.bucket}`}
                                className="inline-flex items-center gap-1 text-xs text-brand font-medium hover:underline"
                              >
                                View Invoices
                                <ArrowRight size={13} />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptyState title="No aging data available" description="There are currently no active receivables invoices." />
            )}
          </div>
        </div>
      )}

      {/* TAB 2: INVOICE RECEIVABLES LEDGER */}
      {activeTab === "ledger" && (
        <div className="space-y-4">
          {/* Ledger Controls */}
          <div className="bg-white p-4 rounded-xl border border-surface-border shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search invoice number, customer..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-surface-border rounded-lg bg-surface/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              {/* Bucket Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-text-secondary font-medium">Bucket:</span>
                <select
                  value={ledgerBucket}
                  onChange={(e) => setLedgerBucket(e.target.value)}
                  className="px-2.5 py-1.5 bg-surface/50 border border-surface-border rounded-lg text-text-primary text-xs focus:ring-1 focus:ring-brand focus:outline-none"
                >
                  <option value="ALL">All Buckets</option>
                  <option value="NOT_DUE">Current (Not Due)</option>
                  <option value="1_30">1-30 Days</option>
                  <option value="31_60">31-60 Days</option>
                  <option value="61_90">61-90 Days</option>
                  <option value="90_PLUS">90+ Days</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-text-secondary font-medium">Status:</span>
                <select
                  value={ledgerStatus}
                  onChange={(e) => setLedgerStatus(e.target.value)}
                  className="px-2.5 py-1.5 bg-surface/50 border border-surface-border rounded-lg text-text-primary text-xs focus:ring-1 focus:ring-brand focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="UNPAID">Unpaid</option>
                  <option value="PARTIALLY_PAID">Partially Paid</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-text-secondary font-medium">
              Showing {filteredInvoices.length} of {invoices.length} active invoices
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-xl border border-surface-border shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Invoice Number</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium text-center">Overdue Days</th>
                  <th className="px-4 py-3 font-medium text-right">Total Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Paid / Allocated</th>
                  <th className="px-4 py-3 font-medium text-right">Outstanding Balance</th>
                  <th className="px-4 py-3 font-medium text-center">Aging Bucket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {isInvoicesLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-text-muted">
                      Loading receivables ledger...
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12">
                      <EmptyState
                        icon={FileText}
                        title="No matching invoices found"
                        description="Try modifying your search or bucket filter criteria."
                      />
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const cName = customerMap.get(inv.customer_id);
                    const bucketMeta = BUCKET_LABELS[inv.aging_bucket] || { label: inv.aging_bucket, badgeVariant: "default" };

                    return (
                      <tr key={inv.invoice_id} className="hover:bg-surface/50 transition-colors">
                        <td className="px-4 py-3.5 align-middle">
                          <Link
                            href={`/invoices/${inv.invoice_id}`}
                            className="font-medium text-brand hover:underline font-mono"
                          >
                            {inv.invoice_number}
                          </Link>
                        </td>

                        <td className="px-4 py-3.5 align-middle">
                          <Link
                            href={`/customers/${inv.customer_id}`}
                            className="text-text-primary hover:text-brand hover:underline font-medium block"
                          >
                            {cName || inv.customer_id.slice(0, 8)}
                          </Link>
                          {cName && (
                            <span className="text-[11px] font-mono text-text-muted block">
                              {inv.customer_id.slice(0, 8)}...
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-middle text-xs text-text-secondary">
                          {inv.due_date ? formatDateShort(inv.due_date) : "—"}
                        </td>

                        <td className="px-4 py-3.5 align-middle text-center font-mono text-xs">
                          {inv.days_overdue > 0 ? (
                            <span className="text-status-error font-semibold">+{inv.days_overdue} d</span>
                          ) : (
                            <span className="text-status-success">Current</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-middle text-right">
                          <CurrencyDisplay amount={inv.total_amount} currency={inv.currency} size="sm" />
                        </td>

                        <td className="px-4 py-3.5 align-middle text-right">
                          <CurrencyDisplay
                            amount={inv.paid_amount}
                            currency={inv.currency}
                            size="sm"
                            className="text-text-secondary"
                          />
                        </td>

                        <td className="px-4 py-3.5 align-middle text-right">
                          <CurrencyDisplay
                            amount={inv.outstanding_amount}
                            currency={inv.currency}
                            size="sm"
                            className="font-bold text-text-primary"
                          />
                        </td>

                        <td className="px-4 py-3.5 align-middle text-center">
                          <Badge variant={bucketMeta.badgeVariant}>{bucketMeta.label}</Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PAYMENTS & CASH FLOW */}
      {activeTab === "payments" && (
        <div className="space-y-6">
          {/* Payment Receipts Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-surface-border shadow-xs">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
                Total Cash Receipts
              </span>
              <div className="mt-1.5">
                <CurrencyDisplay amount={paymentsMetrics.recorded} currency="INR" size="lg" className="font-bold text-text-primary" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-surface-border shadow-xs">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
                Applied to Invoices
              </span>
              <div className="mt-1.5">
                <CurrencyDisplay amount={paymentsMetrics.allocated} currency="INR" size="lg" className="font-semibold text-text-secondary" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-surface-border shadow-xs">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
                Unallocated Cash Float
              </span>
              <div className="mt-1.5">
                <CurrencyDisplay
                  amount={paymentsMetrics.unallocated}
                  currency="INR"
                  size="lg"
                  className={`font-bold ${paymentsMetrics.unallocated > 0 ? "text-brand" : "text-text-muted"}`}
                />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-surface-border shadow-xs">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
                Reversed Receipts
              </span>
              <div className="mt-1.5">
                <CurrencyDisplay amount={paymentsMetrics.reversed} currency="INR" size="lg" className="font-bold text-status-error" />
              </div>
            </div>
          </div>

          {/* Payments Table */}
          <div className="bg-white rounded-xl border border-surface-border shadow-xs overflow-hidden">
            <div className="p-4 border-b border-surface-border flex justify-between items-center bg-surface/50">
              <h3 className="font-bold text-text-primary text-sm">Recorded Payment Receipts Ledger</h3>
              <Link href="/collections/payments" className="text-xs font-medium text-brand hover:underline flex items-center gap-1">
                Manage in Payments Workspace <ExternalLink size={12} />
              </Link>
            </div>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Date Received</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Allocated</th>
                  <th className="px-4 py-3 font-medium text-right">Unallocated Float</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {isPaymentsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-text-muted">
                      Loading payments...
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12">
                      <EmptyState icon={CreditCard} title="No payments recorded" description="No verified cash receipts logged in the system." />
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => {
                    const isReversed = !!p.reversal;
                    const cName = customerMap.get(p.customer_id);

                    return (
                      <tr key={p.id} className="hover:bg-surface/50 transition-colors">
                        <td className="px-4 py-3.5 align-middle">
                          <span className="font-mono font-medium text-text-primary block">
                            {p.reference || "No Reference"}
                          </span>
                          <span className="text-[11px] text-text-secondary">
                            {p.payment_method.replace(/_/g, " ")}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 align-middle">
                          <Link href={`/customers/${p.customer_id}`} className="text-brand hover:underline font-medium">
                            {cName || p.customer_id}
                          </Link>
                        </td>

                        <td className="px-4 py-3.5 align-middle text-xs text-text-secondary">
                          {formatDateShort(p.payment_date)}
                        </td>

                        <td className="px-4 py-3.5 align-middle text-right">
                          <CurrencyDisplay amount={p.amount} currency={p.currency} size="sm" className="font-semibold text-text-primary" />
                        </td>

                        <td className="px-4 py-3.5 align-middle text-right text-text-secondary">
                          <CurrencyDisplay amount={p.allocated_amount} currency={p.currency} size="sm" />
                        </td>

                        <td className="px-4 py-3.5 align-middle text-right font-mono">
                          <CurrencyDisplay
                            amount={p.unallocated_amount}
                            currency={p.currency}
                            size="sm"
                            className={p.unallocated_amount > 0 && !isReversed ? "text-brand font-bold" : "text-text-muted"}
                          />
                        </td>

                        <td className="px-4 py-3.5 align-middle text-center">
                          {isReversed ? (
                            <Badge variant="error">REVERSED</Badge>
                          ) : p.unallocated_amount === 0 ? (
                            <Badge variant="success">FULLY ALLOCATED</Badge>
                          ) : p.allocated_amount > 0 ? (
                            <Badge variant="warning">PARTIAL</Badge>
                          ) : (
                            <Badge variant="muted">UNALLOCATED</Badge>
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
      )}

      {/* TAB 4: COLLECTION PERFORMANCE (DEMO) */}
      {activeTab === "performance" && (
        <div className="space-y-6">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
            <AlertCircle size={18} className="shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-semibold block">Collection Performance Reporting Scope:</strong>
              <p>
                The live ACCO FastAPI backend does not yet record collector assignment queues, recovery targets, or individual agent response times. The metrics below represent simulated demo workflows and should not be used as audited live performance evaluations.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Payment Promise Performance */}
            <div className="bg-white rounded-xl border border-surface-border p-6 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-surface-border pb-3">
                <h3 className="font-bold text-text-primary text-sm flex items-center gap-2">
                  <Target size={16} className="text-brand" />
                  Payment Promise Performance
                </h3>
                <Badge variant="warning">Demo Only</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 bg-surface rounded-lg border border-surface-border">
                  <span className="text-xs text-text-secondary block">Total Promises Logged</span>
                  <span className="text-lg font-bold text-text-primary">{promises.length}</span>
                </div>
                <div className="p-3 bg-surface rounded-lg border border-surface-border">
                  <span className="text-xs text-text-secondary block">Active / Pending</span>
                  <span className="text-lg font-bold text-brand">
                    {promises.filter((p) => p.status === "ACTIVE").length}
                  </span>
                </div>
                <div className="p-3 bg-surface rounded-lg border border-surface-border">
                  <span className="text-xs text-text-secondary block">Fulfilled</span>
                  <span className="text-lg font-bold text-status-success">
                    {promises.filter((p) => p.status === "FULFILLED").length}
                  </span>
                </div>
                <div className="p-3 bg-surface rounded-lg border border-surface-border">
                  <span className="text-xs text-text-secondary block">Missed / Breached</span>
                  <span className="text-lg font-bold text-status-error">
                    {promises.filter((p) => p.status === "MISSED").length}
                  </span>
                </div>
              </div>

              <div className="pt-2 text-xs text-text-secondary space-y-1">
                <p>
                  <strong>Debtor Intention Rule:</strong> Promises represent debtor commitment dates, not verified cash receipts.
                </p>
              </div>
            </div>

            {/* Collector Workload & Target Analysis */}
            <div className="bg-white rounded-xl border border-surface-border p-6 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-surface-border pb-3">
                <h3 className="font-bold text-text-primary text-sm flex items-center gap-2">
                  <Clock size={16} className="text-brand" />
                  Collector Workload & Recovery Rate
                </h3>
                <Badge variant="muted">Unavailable in Live API</Badge>
              </div>

              <div className="p-6 text-center text-sm text-text-secondary space-y-2">
                <p>Live endpoint unavailable for individual collector team assignment queues.</p>
                {isDemoMode ? (
                  <div className="pt-2 text-xs space-y-2 text-left bg-surface p-3 rounded-lg border border-surface-border">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Simulated Recovery Rate:</span>
                      <span className="font-semibold text-text-primary">68.5% (Demo benchmark)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Simulated Active Cases:</span>
                      <span className="font-semibold text-text-primary">12 Assigned Cases</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">
                    Enable Demo Mode in settings to view simulated operational layouts.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
