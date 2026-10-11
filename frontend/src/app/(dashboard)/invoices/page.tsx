"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoicesApi } from "@/lib/api/invoices.api";
import { customersApi } from "@/lib/api/customers.api";
import { receivablesApi } from "@/lib/api/receivables.api";
import { FilterBar } from "@/components/shared/FilterBar";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { FileText, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { formatDateShort, daysOverdue } from "@/lib/formatting/dates";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { clsx } from "clsx";

const PAGE_SIZE = 50;

type SortField = "invoice_number" | "customer" | "issue_date" | "due_date" | "total_amount" | "paid_amount" | "outstanding_amount";
type SortDir = "asc" | "desc";

function InvoicesDirectoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // URL State initialization
  const initialSearch = searchParams.get("search") || "";
  const initialStatus = searchParams.get("status") || "";
  const initialBucket = searchParams.get("bucket") || "";
  const initialCustomer = searchParams.get("customer_id") || "";
  const initialPaymentStatus = searchParams.get("payment_status") || "";
  const initialPage = parseInt(searchParams.get("page") || "1", 10);
  const initialSort = (searchParams.get("sort") as SortField) || "due_date";
  const initialDir = (searchParams.get("dir") as SortDir) || "desc";

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [canonicalStatusFilter, setCanonicalStatusFilter] = useState(initialStatus);
  const [bucketFilter, setBucketFilter] = useState(initialBucket);
  const [customerFilter, setCustomerFilter] = useState(initialCustomer);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState(initialPaymentStatus);
  const [currentPage, setCurrentPage] = useState(isNaN(initialPage) || initialPage < 1 ? 1 : initialPage);
  const [sortField, setSortField] = useState<SortField>(initialSort);
  const [sortDirection, setSortDirection] = useState<SortDir>(initialDir);

  // Sync state to URL search params
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (canonicalStatusFilter) params.set("status", canonicalStatusFilter);
    if (bucketFilter) params.set("bucket", bucketFilter);
    if (customerFilter) params.set("customer_id", customerFilter);
    if (paymentStatusFilter) params.set("payment_status", paymentStatusFilter);
    if (currentPage > 1) params.set("page", currentPage.toString());
    if (sortField !== "due_date") params.set("sort", sortField);
    if (sortDirection !== "desc") params.set("dir", sortDirection);

    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`);
  }, [
    searchTerm,
    canonicalStatusFilter,
    bucketFilter,
    customerFilter,
    paymentStatusFilter,
    currentPage,
    sortField,
    sortDirection,
    pathname,
    router,
  ]);

  // Server-side filtered query for invoices: passing canonical status, customer_id, limit, offset
  const {
    data: rawInvoices = [],
    isLoading: isInvoicesLoading,
    isError: isInvoicesError,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ["invoices", canonicalStatusFilter, customerFilter, currentPage],
    queryFn: () =>
      invoicesApi.list({
        status: canonicalStatusFilter || undefined,
        customer_id: customerFilter || undefined,
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      }),
  });

  // Query for customers to map customer_id to customer names
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => customersApi.list(),
  });

  // Query for receivables balances
  const {
    data: receivablesBalances = [],
    isLoading: isReceivablesLoading,
  } = useQuery({
    queryKey: ["receivables-invoices-balances", customerFilter],
    queryFn: () => receivablesApi.getInvoices(customerFilter ? { customer_id: customerFilter } : {}),
  });

  // Build lookups
  const customersMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const receivablesMap = useMemo(() => {
    const map = new Map<string, (typeof receivablesBalances)[0]>();
    receivablesBalances.forEach((rb) => map.set(rb.invoice_id, rb));
    return map;
  }, [receivablesBalances]);

  // Merge canonical invoice info with customer and live financial balance
  const enrichedInvoices = useMemo(() => {
    return rawInvoices.map((inv) => {
      const customerName = customersMap.get(inv.customer_id) || "—";
      const balance = receivablesMap.get(inv.id);

      let paidAmount = 0;
      let outstandingAmount = Number(inv.total_amount);
      let paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "VOID" = "UNPAID";
      let agingBucket = "NOT_DUE";
      let overdue = daysOverdue(inv.due_date);

      if (inv.status === "VOID") {
        paidAmount = 0;
        outstandingAmount = 0;
        paymentStatus = "VOID";
        agingBucket = "NOT_DUE";
        overdue = 0;
      } else if (inv.status === "DRAFT") {
        paidAmount = 0;
        outstandingAmount = Number(inv.total_amount);
        paymentStatus = "UNPAID";
        agingBucket = "NOT_DUE";
        overdue = 0;
      } else if (balance) {
        paidAmount = Number(balance.paid_amount);
        outstandingAmount = Number(balance.outstanding_amount);
        paymentStatus = balance.payment_status;
        agingBucket = balance.aging_bucket;
        overdue = balance.days_overdue;
      } else {
        // Fallback for issued without explicit balance record
        if (overdue > 0) {
          agingBucket = overdue <= 30 ? "1_30" : overdue <= 60 ? "31_60" : overdue <= 90 ? "61_90" : "90_PLUS";
        }
      }

      return {
        ...inv,
        customer_name: customerName,
        paid_amount: paidAmount,
        outstanding_amount: outstandingAmount,
        payment_status: paymentStatus,
        aging_bucket: agingBucket,
        days_overdue: overdue,
      };
    });
  }, [rawInvoices, customersMap, receivablesMap]);

  // Client-side search, aging bucket, payment status filter, and sorting across loaded page
  const filteredAndSortedInvoices = useMemo(() => {
    return enrichedInvoices
      .filter((inv) => {
        // Search term
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const matchNumber = inv.invoice_number.toLowerCase().includes(term);
          const matchDesc = inv.description ? inv.description.toLowerCase().includes(term) : false;
          const matchCustomer = inv.customer_name.toLowerCase().includes(term);
          if (!matchNumber && !matchDesc && !matchCustomer) return false;
        }

        // Aging bucket filter (e.g. from Dashboard or Collections navigation)
        if (bucketFilter && inv.aging_bucket !== bucketFilter) {
          return false;
        }

        // Payment status filter
        if (paymentStatusFilter && inv.payment_status !== paymentStatusFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let aVal: string | number = "";
        let bVal: string | number = "";

        switch (sortField) {
          case "invoice_number":
            aVal = a.invoice_number;
            bVal = b.invoice_number;
            break;
          case "customer":
            aVal = a.customer_name;
            bVal = b.customer_name;
            break;
          case "issue_date":
            aVal = new Date(a.issue_date).getTime();
            bVal = new Date(b.issue_date).getTime();
            break;
          case "due_date":
            aVal = new Date(a.due_date).getTime();
            bVal = new Date(b.due_date).getTime();
            break;
          case "total_amount":
            aVal = Number(a.total_amount);
            bVal = Number(b.total_amount);
            break;
          case "paid_amount":
            aVal = a.paid_amount;
            bVal = b.paid_amount;
            break;
          case "outstanding_amount":
            aVal = a.outstanding_amount;
            bVal = b.outstanding_amount;
            break;
          default:
            aVal = a.invoice_number;
            bVal = b.invoice_number;
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
  }, [enrichedInvoices, searchTerm, bucketFilter, paymentStatusFilter, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const renderSortHeader = (field: SortField, label: string, align: "left" | "right" = "left") => {
    const isActive = sortField === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={clsx(
          "flex items-center gap-1 font-semibold text-xs tracking-wider uppercase transition-colors hover:text-text-primary",
          align === "right" ? "ml-auto justify-end" : "justify-start",
          isActive ? "text-brand" : "text-text-secondary"
        )}
      >
        <span>{label}</span>
        {isActive ? (
          sortDirection === "asc" ? (
            <ArrowUp size={12} className="text-brand shrink-0" />
          ) : (
            <ArrowDown size={12} className="text-brand shrink-0" />
          )
        ) : (
          <ArrowUpDown size={12} className="text-text-muted opacity-40 shrink-0" />
        )}
      </button>
    );
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    setCanonicalStatusFilter("");
    setBucketFilter("");
    setCustomerFilter("");
    setPaymentStatusFilter("");
    setCurrentPage(1);
  };

  const activeFilterCount =
    (canonicalStatusFilter ? 1 : 0) +
    (bucketFilter ? 1 : 0) +
    (customerFilter ? 1 : 0) +
    (paymentStatusFilter ? 1 : 0);

  if (isInvoicesError) {
    return (
      <div className="flex flex-col h-full bg-surface items-center justify-center p-6">
        <EmptyState
          icon={AlertCircle}
          title="Unable to load invoices"
          description="We could not connect to the invoice service. Please verify your connection and try again."
          action={{ label: "Retry", onClick: () => refetchInvoices() }}
        />
      </div>
    );
  }

  const isLoading = isInvoicesLoading || isReceivablesLoading;

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Top Filter Bar */}
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search invoice #, customer, description..."
        filters={[
          {
            label: "Invoice Status",
            key: "canonical_status",
            value: canonicalStatusFilter,
            onChange: (val) => {
              setCanonicalStatusFilter(val);
              setCurrentPage(1);
            },
            options: [
              { label: "Draft", value: "DRAFT" },
              { label: "Issued", value: "ISSUED" },
              { label: "Void", value: "VOID" },
            ],
          },
          {
            label: "Payment Status",
            key: "payment_status",
            value: paymentStatusFilter,
            onChange: (val) => {
              setPaymentStatusFilter(val);
              setCurrentPage(1);
            },
            options: [
              { label: "Unpaid", value: "UNPAID" },
              { label: "Partially Paid", value: "PARTIALLY_PAID" },
              { label: "Paid", value: "PAID" },
            ],
          },
          {
            label: "Aging Bucket",
            key: "aging_bucket",
            value: bucketFilter,
            onChange: (val) => {
              setBucketFilter(val);
              setCurrentPage(1);
            },
            options: [
              { label: "Current (Not Due)", value: "NOT_DUE" },
              { label: "1-30 Days Overdue", value: "1_30" },
              { label: "31-60 Days Overdue", value: "31_60" },
              { label: "61-90 Days Overdue", value: "61_90" },
              { label: "90+ Days Overdue", value: "90_PLUS" },
            ],
          },
          {
            label: "All Customers",
            key: "customer",
            value: customerFilter,
            onChange: (val) => {
              setCustomerFilter(val);
              setCurrentPage(1);
            },
            options: customers.map((c) => ({ label: c.name, value: c.id })),
          },
        ]}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearAllFilters}
      />

      {/* Dataset Completeness & Pagination Notice Banner */}
      <div className="bg-brand-lavender/40 border-b border-surface-border px-6 py-2.5 flex flex-wrap items-center justify-between text-xs text-text-secondary gap-3">
        <div className="flex items-center gap-2">
          <Info size={14} className="text-brand shrink-0" />
          <span>
            Showing up to {PAGE_SIZE} records on Page {currentPage}. Server-side filtering applied for Customer & Canonical Status; client-side evaluation applied for text search and aging buckets across loaded page.
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-text-muted">
            Page {currentPage} ({filteredAndSortedInvoices.length} matching)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || isLoading}
            className="h-7 px-2"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => p + 1)}
            disabled={rawInvoices.length < PAGE_SIZE || isLoading}
            className="h-7 px-2"
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      {/* Invoices Directory Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-xl border border-surface-border shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse" aria-label="Invoices Directory Table">
            <thead>
              <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3.5 font-medium">{renderSortHeader("invoice_number", "Invoice #")}</th>
                <th className="px-4 py-3.5 font-medium">{renderSortHeader("customer", "Customer")}</th>
                <th className="px-4 py-3.5 font-medium">{renderSortHeader("issue_date", "Issue Date")}</th>
                <th className="px-4 py-3.5 font-medium">{renderSortHeader("due_date", "Due Date")}</th>
                <th className="px-4 py-3.5 font-medium text-right">{renderSortHeader("total_amount", "Total", "right")}</th>
                <th className="px-4 py-3.5 font-medium text-right">{renderSortHeader("paid_amount", "Paid", "right")}</th>
                <th className="px-4 py-3.5 font-medium text-right">{renderSortHeader("outstanding_amount", "Outstanding", "right")}</th>
                <th className="px-4 py-3.5 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-text-muted">
                    Loading invoices...
                  </td>
                </tr>
              ) : filteredAndSortedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12">
                    <EmptyState
                      icon={FileText}
                      title="No invoices found"
                      description="No invoices match your current filter and search criteria."
                      action={activeFilterCount > 0 || searchTerm ? { label: "Clear all filters", onClick: clearAllFilters } : undefined}
                    />
                  </td>
                </tr>
              ) : (
                filteredAndSortedInvoices.map((inv) => {
                  const isOverdue = inv.days_overdue > 0 && inv.status === "ISSUED" && inv.payment_status !== "PAID";
                  return (
                    <tr key={inv.id} className="hover:bg-surface/50 transition-colors">
                      {/* 1. Invoice Number */}
                      <td className="px-4 py-3.5 align-top">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-semibold text-text-primary hover:text-brand transition-colors block text-sm"
                        >
                          {inv.invoice_number}
                        </Link>
                        {inv.description && (
                          <div className="text-xs text-text-secondary mt-0.5 truncate max-w-xs" title={inv.description}>
                            {inv.description}
                          </div>
                        )}
                      </td>

                      {/* 2. Customer */}
                      <td className="px-4 py-3.5 align-top text-sm">
                        <Link
                          href={`/customers/${inv.customer_id}`}
                          className="text-text-primary hover:text-brand hover:underline transition-colors font-medium"
                        >
                          {inv.customer_name}
                        </Link>
                      </td>

                      {/* 3. Issue Date */}
                      <td className="px-4 py-3.5 align-top text-sm text-text-secondary">
                        {formatDateShort(inv.issue_date)}
                      </td>

                      {/* 4. Due Date */}
                      <td className="px-4 py-3.5 align-top text-sm">
                        <span className={clsx(isOverdue ? "text-status-error font-medium" : "text-text-secondary")}>
                          {formatDateShort(inv.due_date)}
                        </span>
                        {isOverdue && (
                          <div className="text-[11px] text-status-error font-medium mt-0.5">
                            {inv.days_overdue}d overdue
                          </div>
                        )}
                      </td>

                      {/* 5. Total Amount */}
                      <td className="px-4 py-3.5 align-top text-right">
                        <CurrencyDisplay amount={inv.total_amount} currency={inv.currency} size="md" />
                      </td>

                      {/* 6. Paid Amount */}
                      <td className="px-4 py-3.5 align-top text-right">
                        <CurrencyDisplay
                          amount={inv.paid_amount}
                          currency={inv.currency}
                          size="md"
                          muted={inv.paid_amount === 0}
                          className={inv.paid_amount > 0 ? "text-status-success font-medium" : undefined}
                        />
                      </td>

                      {/* 7. Outstanding Amount */}
                      <td className="px-4 py-3.5 align-top text-right">
                        <CurrencyDisplay
                          amount={inv.outstanding_amount}
                          currency={inv.currency}
                          size="md"
                          className={clsx(
                            inv.outstanding_amount > 0 ? "font-semibold text-brand" : "text-text-muted"
                          )}
                        />
                      </td>

                      {/* 8. Canonical & Payment Status */}
                      <td className="px-4 py-3.5 align-top text-center">
                        <div className="flex flex-col items-center gap-1">
                          {inv.status === "ISSUED" ? (
                            <StatusBadge type="invoice" status={inv.payment_status} />
                          ) : (
                            <StatusBadge type="invoice" status={inv.status} />
                          )}
                          {inv.status === "ISSUED" && inv.payment_status !== "PAID" && inv.aging_bucket !== "NOT_DUE" && (
                            <span className="text-[10px] uppercase font-bold text-text-muted px-1.5 py-0.5 bg-surface rounded">
                              {inv.aging_bucket.replace("_", "-")}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesDirectoryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-muted">Loading invoice directory...</div>}>
      <InvoicesDirectoryContent />
    </Suspense>
  );
}
