"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { paymentsApi } from "@/lib/api/payments.api";
import { FilterBar } from "@/components/shared/FilterBar";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreditCard } from "lucide-react";
import { formatDateShort } from "@/lib/formatting/dates";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { useDemoMode } from "@/providers/DemoModeProvider";

export default function PaymentsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { isDemoMode } = useDemoMode();

  const { data: payments = [], isLoading, error } = useQuery({
    queryKey: ["payments"],
    queryFn: () => paymentsApi.listPayments(),
  });

  const filtered = payments.filter(p => 
    p.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.customer_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="p-6 border-b border-surface-border bg-white flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            Payments & Reconciliation
            {!isDemoMode && <Badge variant="success">Live API</Badge>}
          </h1>
          <p className="text-sm text-text-secondary mt-1">Manage recorded payments and invoice allocations.</p>
        </div>
      </div>

      <FilterBar 
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by reference or customer..."
        activeFilterCount={0}
      />

      <div className="flex-1 overflow-auto p-6">
        {error ? (
          <div className="p-6 bg-status-error-bg text-status-error rounded-lg">
            Error loading payments: {(error as Error).message}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Customer ID</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Allocated</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                      Loading payments...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8">
                      <EmptyState 
                        icon={CreditCard}
                        title="No payments found"
                        description="There are currently no recorded payments matching your criteria."
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-surface/50 transition-colors group">
                      <td className="px-4 py-3 align-top">
                        <span className="font-medium text-text-primary">
                          {item.reference || "No Reference"}
                        </span>
                        <div className="text-xs text-text-secondary mt-0.5">
                          {item.payment_method.replace("_", " ")}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Link href={`/customers/${item.customer_id}`} className="text-brand hover:underline font-medium text-sm">
                          {item.customer_id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <CurrencyDisplay amount={item.amount} currency={item.currency || "INR"} />
                        {item.reversal && (
                          <div className="text-xs text-status-error mt-0.5">Reversed</div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <CurrencyDisplay amount={item.allocated_amount} currency={item.currency || "INR"} className="text-text-secondary" />
                      </td>
                      <td className="px-4 py-3 align-top">
                        {item.reversal ? (
                          <Badge variant="error">REVERSED</Badge>
                        ) : item.unallocated_amount === 0 ? (
                          <Badge variant="success">FULLY ALLOCATED</Badge>
                        ) : item.allocated_amount > 0 ? (
                          <Badge variant="warning">PARTIAL</Badge>
                        ) : (
                          <Badge variant="muted">UNALLOCATED</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-sm">
                        {formatDateShort(item.payment_date)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
