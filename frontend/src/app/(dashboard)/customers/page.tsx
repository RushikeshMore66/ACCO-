"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers.api";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

export default function CustomersDirectoryPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list(),
  });

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full bg-surface">
      <FilterBar 
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search customers..."
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Customer Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-text-muted">
                    Loading customers...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8">
                    <EmptyState 
                      icon={Users}
                      title="No customers found"
                      description="Try adjusting your search filters."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-surface/50 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/customers/${item.id}`} className="font-medium text-text-primary hover:text-brand transition-colors">
                        {item.name}
                      </Link>
                      {item.tax_identifier && (
                        <div className="text-xs text-text-secondary mt-0.5">
                          TID: {item.tax_identifier}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-text-secondary space-y-1">
                      <div className="font-medium text-text-primary">{item.contact_name || "—"}</div>
                      {item.email && <div className="flex items-center gap-1.5"><Mail size={12} /> {item.email}</div>}
                      {item.phone && <div className="flex items-center gap-1.5"><Phone size={12} /> {item.phone}</div>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant={item.is_active ? "success" : "muted"}>
                        {item.is_active ? "Active" : "Inactive"}
                      </Badge>
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
