"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { collectionsApi } from "@/lib/api/collections.api";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AlertTriangle } from "lucide-react";
import { formatDateShort } from "@/lib/formatting/dates";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

export default function DisputesPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: disputes = [], isLoading, isError } = useQuery({
    queryKey: ["disputes"],
    queryFn: () => collectionsApi.listAllDisputes(),
    retry: false,
  });

  const filtered = disputes.filter(d => 
    d.invoice_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.description && d.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full bg-surface">
      <FilterBar 
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search disputes..."
        activeFilterCount={0}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Invoice ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                    Loading disputes...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <EmptyState 
                      icon={AlertTriangle}
                      title="Global List Unavailable"
                      description="Global dispute listing is currently available in Demo Mode only. Please view disputes on individual invoices."
                    />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <EmptyState 
                      icon={AlertTriangle}
                      title="No disputes found"
                      description="There are currently no active or historical disputes."
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
                      {item.description && (
                        <div className="text-xs text-text-secondary mt-0.5 truncate max-w-xs">
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                       <StatusBadge type="dispute" status={item.status} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant="muted">{item.category.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top text-sm">
                      {formatDateShort(item.created_at)}
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
