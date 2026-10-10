"use client";

import { useQuery } from "@tanstack/react-query";
import { invoicesApi } from "@/lib/api/invoices.api";
import { customersApi } from "@/lib/api/customers.api";
import { receivablesApi } from "@/lib/api/receivables.api";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, daysOverdue } from "@/lib/formatting/dates";
import { FileText, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMemo } from "react";

export default function InvoiceDetailPage({ params }: { params: { invoiceId: string } }) {
  const { invoiceId } = params;

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
  });

  const { data: customer } = useQuery({
    queryKey: ["customer", invoice?.customer_id],
    queryFn: () => customersApi.get(invoice!.customer_id),
    enabled: !!invoice?.customer_id,
  });

  const { data: receivablesInvoices = [] } = useQuery({
    queryKey: ["receivables-invoices", invoice?.customer_id],
    queryFn: () => receivablesApi.getInvoices({ customer_id: invoice!.customer_id }),
    enabled: !!invoice?.customer_id,
  });

  const invoiceBalanceInfo = useMemo(() => {
    return receivablesInvoices.find(ri => ri.invoice_id === invoiceId);
  }, [receivablesInvoices, invoiceId]);

  if (isLoading) {
    return <div className="p-6"><Skeleton height={400} className="w-full" /></div>;
  }

  if (isError || !invoice) {
    return <div className="p-6 text-status-error">Failed to load invoice</div>;
  }

  const overdue = daysOverdue(invoice.due_date);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/invoices" className="p-2 rounded-md hover:bg-surface-border transition-colors text-text-secondary hover:text-text-primary">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-3">
            {invoice.invoice_number}
            <StatusBadge type="invoice" status={invoice.status} />
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Issued to {customer ? <Link href={`/customers/${customer.id}`} className="text-brand hover:underline">{customer.name}</Link> : "..."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
            <h2 className="text-base font-semibold mb-4">Invoice Details</h2>
            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
              <div>
                <span className="block text-text-secondary text-xs uppercase tracking-wider mb-1">Issue Date</span>
                <span>{formatDate(invoice.issue_date)}</span>
              </div>
              <div>
                <span className="block text-text-secondary text-xs uppercase tracking-wider mb-1">Due Date</span>
                <span className={overdue > 0 && invoice.status !== "PAID" ? "text-status-error font-medium" : ""}>
                  {formatDate(invoice.due_date)} {overdue > 0 && invoice.status !== "PAID" && `(${overdue} days overdue)`}
                </span>
              </div>
              <div className="col-span-2">
                <span className="block text-text-secondary text-xs uppercase tracking-wider mb-1">Description</span>
                <span>{invoice.description || "—"}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
             <h2 className="text-base font-semibold mb-4">Financial Rules & Status</h2>
             <p className="text-sm text-text-secondary leading-relaxed">
               As per ACCO&apos;s financial invariants, payment promises do not reduce the outstanding balance. A customer&apos;s claim of payment is not treated as a successful allocation. Only verified payments through the canonical workflow reduce the outstanding amount.
             </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary text-sm">Total Amount</span>
              <CurrencyDisplay amount={invoice.total_amount} currency={invoice.currency} size="lg" />
            </div>
            
            <div className="h-px bg-surface-border w-full"></div>
            
            <div className="flex justify-between items-center">
              <span className="font-semibold text-text-primary">Outstanding</span>
              <CurrencyDisplay 
                amount={invoiceBalanceInfo ? invoiceBalanceInfo.outstanding_amount : invoice.total_amount} 
                currency={invoice.currency} 
                size="xl" 
                className="text-brand" 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
