"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { receivablesApi } from "@/lib/api/receivables.api";
import { FilterBar } from "@/components/shared/FilterBar";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FolderKanban } from "lucide-react";
import { formatDateShort } from "@/lib/formatting/dates";
import Link from "next/link";

export default function CollectionsWorkspacePage() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: receivables = [], isLoading } = useQuery({
    queryKey: ["receivables-invoices"],
    queryFn: () => receivablesApi.getInvoices(),
  });

  // Client-side filtering for demo
  const filtered = receivables.filter(r => 
    r.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    // (mock structure doesn't include customer name natively in invoice response, but we filter what we can)
    r.invoice_id.includes(searchTerm)
  );

  return (
    <div className="flex flex-col h-full bg-surface">
      <FilterBar 
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search invoices..."
        activeFilterCount={0}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Outstanding</th>
                <th className="px-4 py-3 font-medium text-right">Days Overdue</th>
                <th className="px-4 py-3 font-medium">Aging Bucket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                    Loading collections...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <EmptyState 
                      icon={FolderKanban}
                      title="No receivables found"
                      description="Try adjusting your search filters."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.invoice_id} className="hover:bg-surface/50 transition-colors group">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/invoices/${item.invoice_id}`} className="font-medium text-text-primary hover:text-brand transition-colors">
                        {item.invoice_number}
                      </Link>
                      <div className="text-xs text-text-secondary mt-0.5">
                        Customer ID: {item.customer_id.split("-")[1]}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge type="invoice" status={item.payment_status} />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <CurrencyDisplay amount={item.outstanding_amount} currency={item.currency} />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <span className={item.days_overdue > 0 ? "text-status-error font-medium" : "text-text-secondary"}>
                        {item.days_overdue > 0 ? item.days_overdue : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-text-secondary">
                      {item.aging_bucket.replace("_", " ")}
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
