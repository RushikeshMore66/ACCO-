"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoicesApi } from "@/lib/api/invoices.api";
import { FilterBar } from "@/components/shared/FilterBar";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileText } from "lucide-react";
import { formatDateShort } from "@/lib/formatting/dates";
import Link from "next/link";

export default function InvoicesDirectoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", statusFilter],
    queryFn: () => invoicesApi.list(statusFilter ? { status: statusFilter } : {}),
  });

  const filtered = invoices.filter(inv => 
    inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (inv.description && inv.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full bg-surface">
      <FilterBar 
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search invoices..."
        filters={[
          {
            label: "All Statuses",
            key: "status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { label: "Draft", value: "DRAFT" },
              { label: "Unpaid", value: "UNPAID" },
              { label: "Overdue", value: "OVERDUE" },
              { label: "Paid", value: "PAID" },
            ]
          }
        ]}
        activeFilterCount={statusFilter ? 1 : 0}
        onClearFilters={() => setStatusFilter("")}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Invoice Number</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Due Date</th>
                <th className="px-4 py-3 font-medium text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                    Loading invoices...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <EmptyState 
                      icon={FileText}
                      title="No invoices found"
                      description="Try adjusting your filters or search term."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-surface/50 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/invoices/${item.id}`} className="font-medium text-text-primary hover:text-brand transition-colors">
                        {item.invoice_number}
                      </Link>
                      {item.description && (
                        <div className="text-xs text-text-secondary mt-0.5 truncate max-w-xs">
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge type="invoice" status={item.status} />
                    </td>
                    <td className="px-4 py-3 align-top text-sm">
                      {formatDateShort(item.due_date)}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <CurrencyDisplay amount={item.total_amount} currency={item.currency} />
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
