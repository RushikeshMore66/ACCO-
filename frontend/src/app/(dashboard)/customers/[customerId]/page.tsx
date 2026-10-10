"use client";

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers.api";
import { receivablesApi } from "@/lib/api/receivables.api";
import { ArrowLeft, MapPin, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateShort } from "@/lib/formatting/dates";

export default function CustomerDetailPage({ params }: { params: { customerId: string } }) {
  const { customerId } = params;

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => customersApi.get(customerId),
  });

  const { data: invoices = [], isLoading: isInvoicesLoading } = useQuery({
    queryKey: ["receivables-invoices", customerId],
    queryFn: () => receivablesApi.getInvoices({ customer_id: customerId }),
  });

  if (isLoading) {
    return <div className="p-6"><Skeleton height={400} className="w-full" /></div>;
  }

  if (!customer) {
    return <div className="p-6 text-status-error">Failed to load customer</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/customers" className="p-2 rounded-md hover:bg-surface-border transition-colors text-text-secondary hover:text-text-primary">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            {customer.name}
            <Badge variant={customer.is_active ? "success" : "muted"}>
              {customer.is_active ? "Active" : "Inactive"}
            </Badge>
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">Contact Information</h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="block text-text-secondary mb-1">Primary Contact</span>
                <span className="font-medium text-text-primary">{customer.contact_name || "—"}</span>
              </div>
              <div className="flex items-start gap-2">
                <Mail size={14} className="text-text-muted mt-0.5 shrink-0" />
                <span className="text-text-primary break-all">{customer.email || "—"}</span>
              </div>
              <div className="flex items-start gap-2">
                <Phone size={14} className="text-text-muted mt-0.5 shrink-0" />
                <span className="text-text-primary">{customer.phone || "—"}</span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-text-muted mt-0.5 shrink-0" />
                <span className="text-text-primary">{customer.billing_address || "—"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <Tabs defaultValue="invoices">
            <TabsList className="mb-6">
              <TabsTrigger value="invoices" count={invoices.length}>Invoices</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            
            <TabsContent value="invoices">
              <div className="bg-white rounded-xl border border-surface-border shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      <th className="px-4 py-3 font-medium">Invoice</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {isInvoicesLoading ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-sm text-text-muted">Loading invoices...</td>
                      </tr>
                    ) : invoices.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-sm text-text-muted">No invoices found for this customer.</td>
                      </tr>
                    ) : (
                      invoices.map((inv) => (
                        <tr key={inv.invoice_id} className="hover:bg-surface/50">
                          <td className="px-4 py-3">
                            <Link href={`/invoices/${inv.invoice_id}`} className="font-medium text-brand hover:underline">
                              {inv.invoice_number}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge type="invoice" status={inv.payment_status} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <CurrencyDisplay amount={inv.outstanding_amount} currency={inv.currency} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="activity">
              <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm text-sm text-text-secondary">
                <div className="text-center py-10">
                  <h3 className="text-lg font-medium text-text-primary mb-2">Activity Timeline</h3>
                  <p className="text-text-muted mb-4 max-w-sm mx-auto">
                    Customer-level consolidated activity timeline is currently under construction and requires backend support. Please view activity on individual invoices.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
