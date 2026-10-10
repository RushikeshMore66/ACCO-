"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { collectionsApi } from "@/lib/api/collections.api";
import { FilterBar } from "@/components/shared/FilterBar";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Handshake } from "lucide-react";
import { formatDateShort } from "@/lib/formatting/dates";
import Link from "next/link";

export default function PromisesPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: promises = [], isLoading, isError } = useQuery({
    queryKey: ["promises"],
    queryFn: () => collectionsApi.listAllPromises(),
    retry: false,
  });

  const filtered = promises.filter(p => 
    p.invoice_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.notes && p.notes.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full bg-surface">
      <FilterBar 
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search promises..."
        activeFilterCount={0}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Invoice ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Promised Amount</th>
                <th className="px-4 py-3 font-medium">Expected Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                    Loading promises...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <EmptyState 
                      icon={Handshake}
                      title="Global List Unavailable"
                      description="Global promise listing is currently available in Demo Mode only. Please view promises on individual invoices."
                    />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <EmptyState 
                      icon={Handshake}
                      title="No payment promises found"
                      description="There are currently no active or historical payment promises."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-surface/50 transition-colors group">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/invoices/${item.invoice_id}`} className="font-medium text-text-primary hover:text-brand transition-colors">
                        {item.invoice_id}
                      </Link>
                      {item.notes && (
                        <div className="text-xs text-text-secondary mt-0.5 truncate max-w-xs">
                          {item.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                       <StatusBadge type="promise" status={item.status} />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <CurrencyDisplay amount={item.promised_amount} currency={item.currency || "INR"} />
                    </td>
                    <td className="px-4 py-3 align-top text-sm">
                      {formatDateShort(item.expected_payment_date)}
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
