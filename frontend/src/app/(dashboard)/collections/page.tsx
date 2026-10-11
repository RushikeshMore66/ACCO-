"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { receivablesApi } from "@/lib/api/receivables.api";
import { FilterBar } from "@/components/shared/FilterBar";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FolderKanban, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { clsx } from "clsx";

function CollectionsWorkspaceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
  const [bucketFilter, setBucketFilter] = useState(searchParams.get("bucket") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  
  type SortField = "days_overdue" | "outstanding_amount";
  type SortDir = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>((searchParams.get("sort") as SortField) || "days_overdue");
  const [sortDirection, setSortDirection] = useState<SortDir>((searchParams.get("dir") as SortDir) || "desc");

  const { data: receivables = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["receivables-invoices"],
    queryFn: () => receivablesApi.getInvoices(),
  });

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (bucketFilter) params.set("bucket", bucketFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (sortField !== "days_overdue") params.set("sort", sortField);
    if (sortDirection !== "desc") params.set("dir", sortDirection);
    
    // Use router.replace to avoid filling browser history
    router.replace(`${pathname}?${params.toString()}`);
  }, [searchTerm, bucketFilter, statusFilter, sortField, sortDirection, pathname, router]);

  const filtered = useMemo(() => {
    return receivables.filter((r) => {
      const matchSearch = 
        r.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customer_id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchBucket = bucketFilter ? r.aging_bucket === bucketFilter : true;
      const matchStatus = statusFilter ? r.payment_status === statusFilter : true;

      return matchSearch && matchBucket && matchStatus;
    }).sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      if (typeof aVal === 'string') aVal = parseFloat(aVal);
      if (typeof bVal === 'string') bVal = parseFloat(bVal);

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [receivables, searchTerm, bucketFilter, statusFilter, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="text-text-muted opacity-50" />;
    return sortDirection === "asc" ? <ArrowUp size={14} className="text-brand" /> : <ArrowDown size={14} className="text-brand" />;
  };

  const activeFilterCount = (bucketFilter ? 1 : 0) + (statusFilter ? 1 : 0);

  if (isError) {
    return (
      <div className="flex flex-col h-full bg-surface items-center justify-center p-6">
        <EmptyState
          icon={AlertCircle}
          title="Unable to load collections"
          description="We could not connect to the receivables service. Please check your connection and try again."
          action={{ label: "Retry", onClick: () => refetch() }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <FilterBar 
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search customer or invoice..."
        filters={[
          {
            label: "All Buckets",
            key: "bucket",
            value: bucketFilter,
            onChange: setBucketFilter,
            options: [
              { label: "Current (Not Due)", value: "NOT_DUE" },
              { label: "1-30 Days", value: "1_30" },
              { label: "31-60 Days", value: "31_60" },
              { label: "61-90 Days", value: "61_90" },
              { label: "90+ Days", value: "90_PLUS" },
            ]
          },
          {
            label: "All Statuses",
            key: "status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { label: "Unpaid", value: "UNPAID" },
              { label: "Partially Paid", value: "PARTIALLY_PAID" },
              { label: "Paid", value: "PAID" },
            ]
          }
        ]}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => {
          setBucketFilter("");
          setStatusFilter("");
        }}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Invoice & Customer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right cursor-pointer group select-none hover:bg-surface-border/30 transition-colors" onClick={() => toggleSort("outstanding_amount")}>
                  <div className="flex items-center justify-end gap-1">
                    Outstanding
                    {renderSortIcon("outstanding_amount")}
                  </div>
                </th>
                <th className="px-4 py-3 font-medium text-right cursor-pointer group select-none hover:bg-surface-border/30 transition-colors" onClick={() => toggleSort("days_overdue")}>
                  <div className="flex items-center justify-end gap-1">
                    Days Overdue
                    {renderSortIcon("days_overdue")}
                  </div>
                </th>
                <th className="px-4 py-3 font-medium">Aging Bucket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                    Loading collections queue...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <EmptyState 
                      icon={FolderKanban}
                      title="No receivables found"
                      description="Try adjusting your search filters to find what you're looking for."
                      action={activeFilterCount > 0 ? { label: "Clear filters", onClick: () => { setBucketFilter(""); setStatusFilter(""); setSearchTerm(""); } } : undefined}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.invoice_id} className="hover:bg-surface/50 transition-colors group">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/invoices/${item.invoice_id}`} className="font-medium text-text-primary hover:text-brand transition-colors block">
                        {item.invoice_number}
                      </Link>
                      <Link href={`/customers/${item.customer_id}`} className="text-xs text-text-secondary hover:text-brand hover:underline mt-0.5 inline-block">
                        {item.customer_id.length > 20 ? item.customer_id.substring(0, 8) + "..." : item.customer_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge type="invoice" status={item.payment_status} />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <CurrencyDisplay amount={item.outstanding_amount} currency={item.currency} className="font-semibold" />
                      {Number(item.paid_amount) > 0 && (
                        <div className="text-xs text-text-secondary mt-0.5">
                          Paid: <CurrencyDisplay amount={item.paid_amount} currency={item.currency} size="sm" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <span className={clsx("font-medium", item.days_overdue > 60 ? "text-status-error" : item.days_overdue > 0 ? "text-status-warning" : "text-text-secondary")}>
                        {item.days_overdue > 0 ? `${item.days_overdue} days` : "Current"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-text-secondary whitespace-nowrap">
                      {item.aging_bucket.replace("_PLUS", "+").replace("_", "-")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function CollectionsWorkspacePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-text-muted text-sm">Loading workspace...</div></div>}>
      <CollectionsWorkspaceContent />
    </Suspense>
  );
}
