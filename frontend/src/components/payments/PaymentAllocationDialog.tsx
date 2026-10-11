"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { invoicesApi } from "@/lib/api/invoices.api";
import { paymentsApi } from "@/lib/api/payments.api";
import { PaymentResponse } from "@/types/payment";
import { Invoice } from "@/types/invoice";
import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { formatDateShort } from "@/lib/formatting/dates";

interface PaymentAllocationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentResponse | null;
  customerName?: string;
  onSuccess?: (updated: PaymentResponse) => void;
}

export function PaymentAllocationDialog({
  isOpen,
  onClose,
  payment,
  customerName,
  onSuccess,
}: PaymentAllocationDialogProps) {
  const queryClient = useQueryClient();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [allocationAmount, setAllocationAmount] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset state on open or payment change
  useEffect(() => {
    if (isOpen) {
      setSelectedInvoiceId("");
      setAllocationAmount("");
      setErrorMessage(null);
    }
  }, [isOpen, payment?.id]);

  // Query eligible customer invoices
  const { data: invoices = [], isLoading: isLoadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["customer-invoices", payment?.customer_id],
    queryFn: () => (payment ? invoicesApi.list({ customer_id: payment.customer_id }) : Promise.resolve([])),
    enabled: isOpen && !!payment?.customer_id,
  });

  // Query balance of the selected invoice if selected
  const { data: selectedInvoiceBalance } = useQuery({
    queryKey: ["invoice-balance", selectedInvoiceId],
    queryFn: () => invoicesApi.getBalance(selectedInvoiceId),
    enabled: isOpen && !!selectedInvoiceId,
  });

  // Eligible invoices are not void and not draft
  const eligibleInvoices = useMemo(() => {
    return invoices.filter((inv) => inv.status !== "VOID" && inv.status !== "DRAFT");
  }, [invoices]);

  const selectedInvoice = useMemo(() => {
    return eligibleInvoices.find((i) => i.id === selectedInvoiceId);
  }, [eligibleInvoices, selectedInvoiceId]);

  // Authoritative outstanding balance for selected invoice
  const invoiceOutstanding = useMemo(() => {
    if (!selectedInvoice) return 0;
    if (selectedInvoiceBalance && typeof selectedInvoiceBalance.outstanding_amount === "number") {
      return Number(selectedInvoiceBalance.outstanding_amount);
    }
    return Number(selectedInvoice.total_amount);
  }, [selectedInvoice, selectedInvoiceBalance]);

  // Currency mismatch check
  const isCurrencyMismatch = useMemo(() => {
    if (!payment || !selectedInvoice) return false;
    return payment.currency.toUpperCase() !== selectedInvoice.currency.toUpperCase();
  }, [payment, selectedInvoice]);

  // Auto-fill allocation amount when invoice is selected
  const handleSelectInvoice = (inv: Invoice) => {
    setSelectedInvoiceId(inv.id);
    setErrorMessage(null);
    if (payment) {
      const estimatedBalance = Number(inv.total_amount);
      const suggested = Math.min(Number(payment.unallocated_amount), estimatedBalance);
      if (suggested > 0) {
        setAllocationAmount(suggested.toFixed(2));
      }
    }
  };

  const parsedAmount = parseFloat(allocationAmount) || 0;
  const unallocatedPayment = payment ? Number(payment.unallocated_amount) : 0;

  // Validation logic
  const validationError = useMemo(() => {
    if (!selectedInvoiceId) return "Please select an invoice to allocate to.";
    if (isCurrencyMismatch) {
      return `Currency mismatch: Payment is in ${payment?.currency} while Invoice is in ${selectedInvoice?.currency}. Cross-currency allocations are prohibited.`;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return "Allocation amount must be greater than zero.";
    }
    if (parsedAmount > unallocatedPayment) {
      return `Allocation amount cannot exceed the unallocated payment float of ${payment?.currency} ${unallocatedPayment.toFixed(2)}.`;
    }
    if (selectedInvoice && invoiceOutstanding > 0 && parsedAmount > invoiceOutstanding) {
      return `Allocation amount cannot exceed the invoice outstanding balance of ${selectedInvoice.currency} ${invoiceOutstanding.toFixed(2)}.`;
    }
    return null;
  }, [selectedInvoiceId, isCurrencyMismatch, parsedAmount, unallocatedPayment, payment?.currency, selectedInvoice, invoiceOutstanding]);

  // Allocation mutation
  const allocationMutation = useMutation({
    mutationFn: async () => {
      if (!payment) throw new Error("No payment selected");
      if (validationError) throw new Error(validationError);
      return paymentsApi.allocatePayment(payment.id, {
        invoice_id: selectedInvoiceId,
        amount: parsedAmount,
      });
    },
    onSuccess: (updatedPayment) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-balance"] });
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
      if (onSuccess) {
        onSuccess(updatedPayment);
      }
      onClose();
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || "Failed to allocate payment.");
    },
  });

  if (!isOpen || !payment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !allocationMutation.isPending && onClose()}>
      <DialogContent
        title="Allocate Payment to Invoice"
        description="Apply unallocated cash receipt to an outstanding customer invoice."
        size="lg"
      >
        <div className="space-y-5 text-sm">
          {/* Payment Context Card */}
          <div className="bg-surface p-4 rounded-lg border border-surface-border space-y-3">
            <div className="flex justify-between items-center text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">Payment Receipt Summary</span>
              <span>Ref: {payment.reference || payment.id.slice(0, 8)}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-surface-border text-center sm:text-left">
              <div>
                <span className="text-xs text-text-secondary block">Customer</span>
                <span className="font-medium text-text-primary truncate block" title={customerName || payment.customer_id}>
                  {customerName || payment.customer_id.slice(0, 8)}
                </span>
              </div>
              <div>
                <span className="text-xs text-text-secondary block">Total Receipt</span>
                <CurrencyDisplay amount={payment.amount} currency={payment.currency} className="font-semibold" />
              </div>
              <div>
                <span className="text-xs text-text-secondary block">Already Allocated</span>
                <CurrencyDisplay amount={payment.allocated_amount} currency={payment.currency} className="text-text-secondary" />
              </div>
              <div>
                <span className="text-xs text-text-secondary block">Available Float</span>
                <CurrencyDisplay amount={payment.unallocated_amount} currency={payment.currency} className="font-bold text-brand" />
              </div>
            </div>
          </div>

          {/* Invoices Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
              Select Outstanding Invoice ({eligibleInvoices.length} Available)
            </label>
            {isLoadingInvoices ? (
              <div className="p-4 text-center text-text-muted text-sm border border-surface-border rounded-lg">
                Loading customer invoices...
              </div>
            ) : eligibleInvoices.length === 0 ? (
              <div className="p-4 text-center text-text-secondary text-sm border border-dashed border-surface-border rounded-lg bg-surface/50">
                No active or overdue invoices found for this customer.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-surface-border rounded-lg divide-y divide-surface-border">
                {eligibleInvoices.map((inv) => {
                  const isSelected = selectedInvoiceId === inv.id;
                  const mismatch = inv.currency.toUpperCase() !== payment.currency.toUpperCase();
                  return (
                    <div
                      key={inv.id}
                      onClick={() => handleSelectInvoice(inv)}
                      className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-brand/5 border-l-4 border-brand"
                          : "hover:bg-surface/60"
                      } ${mismatch ? "opacity-75" : ""}`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">
                            {inv.invoice_number}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-surface text-text-secondary border border-surface-border">
                            {inv.status}
                          </span>
                          {mismatch && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-status-error-bg text-status-error font-medium">
                              {inv.currency} Mismatch
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-text-secondary">
                          Due: {formatDateShort(inv.due_date)} • Total: <CurrencyDisplay amount={inv.total_amount} currency={inv.currency} size="sm" />
                        </div>
                      </div>
                      <div className="text-right">
                        <input
                          type="radio"
                          name="selected_invoice"
                          checked={isSelected}
                          onChange={() => handleSelectInvoice(inv)}
                          className="h-4 w-4 text-brand focus:ring-brand border-surface-border"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Currency Mismatch Warning */}
          {isCurrencyMismatch && (
            <div className="p-3 bg-status-error-bg text-status-error text-xs rounded-lg flex items-start gap-2 border border-status-error/20">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>Cross-Currency Allocation Prohibited:</strong> Payment currency is {payment.currency}, but selected invoice currency is {selectedInvoice?.currency}. Automatic FX conversion is not permitted.
              </div>
            </div>
          )}

          {/* Allocation Amount Field */}
          {selectedInvoice && !isCurrencyMismatch && (
            <div className="space-y-3 bg-surface/50 p-4 rounded-lg border border-surface-border">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                  Proposed Allocation Amount ({payment.currency})
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const maxAllowed = Math.min(unallocatedPayment, invoiceOutstanding || unallocatedPayment);
                    setAllocationAmount(maxAllowed.toFixed(2));
                  }}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Fill Max ({payment.currency} {Math.min(unallocatedPayment, invoiceOutstanding || unallocatedPayment).toFixed(2)})
                </button>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={unallocatedPayment}
                  value={allocationAmount}
                  onChange={(e) => {
                    setAllocationAmount(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand font-mono"
                />
              </div>

              {/* Pre-submission Financial Impact Preview */}
              {parsedAmount > 0 && !validationError && (
                <div className="pt-2 border-t border-surface-border grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-text-secondary block">Remaining Unallocated Float:</span>
                    <CurrencyDisplay
                      amount={Math.max(0, unallocatedPayment - parsedAmount)}
                      currency={payment.currency}
                      size="sm"
                      className="font-medium"
                    />
                  </div>
                  <div>
                    <span className="text-text-secondary block">Remaining Invoice Balance:</span>
                    <CurrencyDisplay
                      amount={Math.max(0, (invoiceOutstanding || Number(selectedInvoice.total_amount)) - parsedAmount)}
                      currency={selectedInvoice.currency}
                      size="sm"
                      className="font-medium"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-status-error-bg text-status-error text-xs rounded-lg flex items-center gap-2 border border-status-error/20">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Validation Inline Warning */}
          {validationError && selectedInvoiceId && !isCurrencyMismatch && (
            <div className="p-2.5 bg-status-warning-bg text-status-warning text-xs rounded-lg flex items-center gap-2">
              <Info size={14} className="shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={allocationMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={
              !selectedInvoiceId ||
              isCurrencyMismatch ||
              !!validationError ||
              allocationMutation.isPending
            }
            isLoading={allocationMutation.isPending}
            onClick={() => allocationMutation.mutate()}
          >
            Confirm Allocation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
