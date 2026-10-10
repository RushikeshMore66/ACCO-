import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { CustomerReplyAnalysis } from "@/types/reply_analysis";
import { collectionsApi } from "@/lib/api/collections.api";
import { invoicesApi } from "@/lib/api/invoices.api";
import { receivablesApi } from "@/lib/api/receivables.api";
import { Invoice } from "@/types/invoice";
import { InvoiceBalanceResponse } from "@/types/receivables";
import { formatCurrency } from "@/lib/formatting/currency";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  analysis: CustomerReplyAnalysis;
  invoiceId: string;
}

export function PromiseConfirmationDialog({ isOpen, onClose, analysis, invoiceId }: Props) {
  const [amount, setAmount] = useState<string>(String(analysis.analysis_payload.explicit_payment_amount || ""));
  const [date, setDate] = useState<string>(
    analysis.analysis_payload.proposed_payment_date ? new Date(analysis.analysis_payload.proposed_payment_date).toISOString().split('T')[0] : ""
  );
  const [followUpDate, setFollowUpDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [receivablesInvoices, setReceivablesInvoices] = useState<InvoiceBalanceResponse[]>([]);

  useEffect(() => {
    if (isOpen && invoiceId) {
      invoicesApi.get(invoiceId).then(inv => {
        setInvoice(inv);
        return receivablesApi.getInvoices({ customer_id: inv.customer_id });
      }).then(setReceivablesInvoices).catch(console.error);
    }
  }, [isOpen, invoiceId]);

  const invoiceBalanceInfo = useMemo(() => {
    return receivablesInvoices.find(ri => ri.invoice_id === invoiceId);
  }, [receivablesInvoices, invoiceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    
    try {
      await collectionsApi.createPromise(invoiceId, {
        promised_amount: Number(amount),
        expected_payment_date: new Date(date).toISOString(),
        follow_up_date: followUpDate ? new Date(followUpDate).toISOString() : undefined,
        reply_analysis_id: analysis.id,
        source_message_id: analysis.source_message_id,
        notes: "Created from AI analysis"
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create promise. Overlapping promise may exist.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Confirm Payment Promise">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-status-error/10 text-status-error text-sm rounded-md">{error}</div>}
        
        <div className="bg-surface-elevated p-3 rounded-md mb-4 border border-surface-border">
          <div className="text-sm font-medium text-text-secondary mb-2">Invoice Summary</div>
          <div className="flex justify-between items-center text-sm">
            <span>Invoice ID:</span>
            <span className="font-mono text-text-muted">{invoiceId}</span>
          </div>
          {invoice && (
            <div className="flex justify-between items-center text-sm mt-1">
              <span>Outstanding Balance:</span>
              <span className="font-semibold text-text-primary">
                {formatCurrency(invoiceBalanceInfo ? invoiceBalanceInfo.outstanding_amount : invoice.total_amount, invoice.currency)}
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Promised Amount {invoice ? `(${invoice.currency})` : ""}
          </label>
          <input 
            type="number" 
            step="0.01"
            value={amount} 
            onChange={e => setAmount(e.target.value)}
            required
            className="w-full p-2 border border-surface-border rounded-md"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Expected Payment Date</label>
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)}
            required
            className="w-full p-2 border border-surface-border rounded-md"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Follow-up Date (Required)</label>
          <input 
            type="date" 
            value={followUpDate} 
            onChange={e => setFollowUpDate(e.target.value)}
            required
            className="w-full p-2 border border-surface-border rounded-md"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-surface-border mt-6">
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>Confirm Promise</Button>
        </div>
      </form>
      </DialogContent>
    </Dialog>
  );
}
