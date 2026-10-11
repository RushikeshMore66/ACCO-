import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { CustomerReplyAnalysis } from "@/types/reply_analysis";
import { collectionsApi } from "@/lib/api/collections.api";
import { invoicesApi } from "@/lib/api/invoices.api";
import { customersApi } from "@/lib/api/customers.api";
import { receivablesApi } from "@/lib/api/receivables.api";
import { Invoice } from "@/types/invoice";
import { Customer } from "@/types/customer";
import { InvoiceBalanceResponse } from "@/types/receivables";
import { formatCurrency } from "@/lib/formatting/currency";
import { AlertCircle, AlertTriangle, Handshake, Info } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  analysis: CustomerReplyAnalysis;
  invoiceId: string;
}

/**
 * Safely parse a date string if and only if it follows an explicit ISO / calendar format.
 * Natural language expressions like "next Tuesday", "tomorrow", or relative references
 * must NOT silently convert into an authoritative date.
 */
function safeParseDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const trimmed = dateStr.trim();
  // Strictly require YYYY-MM-DD pattern
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return "";
  }
  try {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
  } catch {
    // Return empty on unparseable verbatim phrase
  }
  return "";
}

export function PromiseConfirmationDialog({ isOpen, onClose, analysis, invoiceId }: Props) {
  const [amount, setAmount] = useState<string>(
    analysis.analysis_payload.explicit_payment_amount != null
      ? String(analysis.analysis_payload.explicit_payment_amount)
      : ""
  );
  const [date, setDate] = useState<string>(
    safeParseDate(analysis.analysis_payload.proposed_payment_date)
  );
  const [followUpDate, setFollowUpDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [receivablesInvoices, setReceivablesInvoices] = useState<InvoiceBalanceResponse[]>([]);

  useEffect(() => {
    if (isOpen && invoiceId) {
      setError(null);
      setAmount(
        analysis.analysis_payload.explicit_payment_amount != null
          ? String(analysis.analysis_payload.explicit_payment_amount)
          : ""
      );
      setDate(safeParseDate(analysis.analysis_payload.proposed_payment_date));
      setFollowUpDate("");

      invoicesApi.get(invoiceId)
        .then(async (inv) => {
          setInvoice(inv);
          if (inv.customer_id) {
            customersApi.get?.(inv.customer_id)?.then?.(setCustomer)?.catch?.(() => {});
            receivablesApi.getInvoices?.({ customer_id: inv.customer_id })
              ?.then?.(setReceivablesInvoices)
              ?.catch?.(() => {});
          }
        })
        .catch((err) => {
          console.error("Failed to load invoice:", err);
        });
    }
  }, [isOpen, invoiceId, analysis]);

  const invoiceBalanceInfo = useMemo(() => {
    return receivablesInvoices.find(ri => ri.invoice_id === invoiceId);
  }, [receivablesInvoices, invoiceId]);

  const outstandingBalance = invoiceBalanceInfo
    ? invoiceBalanceInfo.outstanding_amount
    : invoice
    ? invoice.total_amount
    : null;

  // Analysis status check: Backend requires ACCEPTED status & PAYMENT_PROMISE classification
  const isAnalysisAccepted = analysis.status === "ACCEPTED";
  const isAnalysisPromise = analysis.classification === "PAYMENT_PROMISE";
  const hasAnalysisRestriction = !isAnalysisAccepted || !isAnalysisPromise;

  // Currency mismatch check
  const extractedCurrency = analysis.analysis_payload.currency;
  const invoiceCurrency = invoice?.currency || "INR";
  const isCurrencyMismatch = Boolean(
    extractedCurrency &&
    extractedCurrency.toUpperCase() !== invoiceCurrency.toUpperCase()
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (hasAnalysisRestriction) {
      if (!isAnalysisAccepted) {
        setError(`Cannot create promise: AI Reply Analysis must be ACCEPTED (current status: ${analysis.status}).`);
      } else {
        setError(`Cannot create promise: AI Reply Analysis must be classified as PAYMENT_PROMISE (current: ${analysis.classification}).`);
      }
      return;
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError("Promised amount must be greater than zero.");
      return;
    }

    if (outstandingBalance !== null && numericAmount > Number(outstandingBalance)) {
      setError(`Promised amount cannot exceed the outstanding balance of ${formatCurrency(outstandingBalance, invoiceCurrency)}.`);
      return;
    }

    if (!date) {
      setError("Please select an explicit expected payment date.");
      return;
    }

    if (!followUpDate) {
      setError("Follow-up date is required.");
      return;
    }

    if (new Date(followUpDate) < new Date(date)) {
      setError("Follow-up date must be on or after the expected payment date.");
      return;
    }

    setIsSubmitting(true);
    
    try {
      await collectionsApi.createPromise(invoiceId, {
        promised_amount: numericAmount,
        expected_payment_date: date,
        follow_up_date: followUpDate,
        reply_analysis_id: analysis.id,
        source_message_id: analysis.source_message_id || undefined,
        notes: `Created from confirmed AI reply analysis (${analysis.id})`
      });
      onClose();
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("409") || msg.toLowerCase().includes("conflict") || msg.toLowerCase().includes("active promise")) {
        if (msg.toLowerCase().includes("conflicting promise")) {
          setError("A conflicting promise was already created from this analysis.");
        } else {
          setError("An active promise already exists for this invoice or a conflicting promise was previously created.");
        }
      } else {
        setError(msg || "Failed to create payment promise. Please verify your details.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Confirm Payment Promise">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 text-status-error text-sm rounded-md flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Canonical Context Summary */}
          <div className="bg-surface-elevated p-3.5 rounded-lg border border-surface-border space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Customer:</span>
              <span className="font-semibold text-text-primary">
                {customer?.name || analysis.customer_id || "Customer Context"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Invoice:</span>
              <span className="font-mono text-text-primary font-medium">
                {invoice?.invoice_number || invoiceId}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-surface-border">
              <span className="text-text-secondary">Outstanding Balance:</span>
              <span className="font-bold text-text-primary">
                {outstandingBalance !== null
                  ? formatCurrency(outstandingBalance, invoiceCurrency)
                  : "Loading..."}
              </span>
            </div>
          </div>

          {/* Currency Mismatch Warning */}
          {isCurrencyMismatch && (
            <div className="p-3 bg-status-warning/10 border border-status-warning/30 rounded-lg text-xs text-status-warning flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-status-warning" />
              <div>
                <strong className="block font-semibold">Currency Denomination Notice</strong>
                The extracted communication referenced {extractedCurrency}, but the canonical invoice is denominated in {invoiceCurrency}. The promise will be registered in {invoiceCurrency}.
              </div>
            </div>
          )}

          {/* Analysis Restriction Notice */}
          {hasAnalysisRestriction && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-xs text-status-error flex items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <div>
                <strong className="block font-semibold">Analysis Restriction</strong>
                {!isAnalysisAccepted
                  ? `This analysis is currently "${analysis.status}". Backend policy requires reply analyses to be ACCEPTED before creating a payment promise.`
                  : `This analysis is classified as "${analysis.classification}". Only PAYMENT_PROMISE analyses can initiate a promise.`}
              </div>
            </div>
          )}

          {/* Explicit Financial Notice */}
          <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg text-xs text-brand-dark flex items-start gap-2">
            <Info size={15} className="mt-0.5 shrink-0 text-brand" />
            <div>
              <span className="font-semibold block">Important financial note</span>
              Recording a payment promise tracks collector commitments. It does not reduce the invoice outstanding balance or represent actual funds received.
            </div>
          </div>

          {/* Verbatim AI Extraction Context if present */}
          {analysis.analysis_payload.proposed_payment_date && !safeParseDate(analysis.analysis_payload.proposed_payment_date) && (
            <div className="p-2.5 bg-surface text-xs text-text-secondary rounded border border-surface-border flex items-start gap-2">
              <Info size={14} className="mt-0.5 shrink-0 text-text-muted" />
              <div>
                Customer stated payment timing: <span className="font-medium text-text-primary italic">&ldquo;{analysis.analysis_payload.proposed_payment_date}&rdquo;</span>. Natural language expressions cannot be authoritatively converted. Please select an explicit calendar date below.
              </div>
            </div>
          )}

          <div>
            <label htmlFor="promised-amount-input" className="block text-sm font-medium text-text-secondary mb-1">
              Promised Amount ({invoiceCurrency})
            </label>
            <input 
              id="promised-amount-input"
              aria-label="Promised Amount"
              type="number" 
              step="0.01"
              value={amount} 
              onChange={e => setAmount(e.target.value)}
              required
              className="w-full p-2 border border-surface-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand text-sm"
              placeholder="e.g. 50000"
            />
          </div>

          <div>
            <label htmlFor="expected-payment-date-input" className="block text-sm font-medium text-text-secondary mb-1">
              Expected Payment Date
            </label>
            <input 
              id="expected-payment-date-input"
              aria-label="Expected Payment Date"
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)}
              required
              className="w-full p-2 border border-surface-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand text-sm"
            />
          </div>

          <div>
            <label htmlFor="follow-up-date-input" className="block text-sm font-medium text-text-secondary mb-1">
              Follow-up Date (Required)
            </label>
            <input 
              id="follow-up-date-input"
              aria-label="Follow-up Date"
              type="date" 
              value={followUpDate} 
              onChange={e => setFollowUpDate(e.target.value)}
              required
              className="w-full p-2 border border-surface-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand text-sm"
            />
            <span className="text-xs text-text-muted mt-1 block">Must be on or after expected payment date</span>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-surface-border mt-6">
            <Button variant="outline" onClick={onClose} type="button" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting || hasAnalysisRestriction}
            >
              <Handshake size={15} className="mr-1.5" />
              {isSubmitting ? "Confirming..." : "Confirm Promise"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

