"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { paymentsApi } from "@/lib/api/payments.api";
import { PaymentResponse } from "@/types/payment";
import { AlertTriangle, AlertCircle } from "lucide-react";

interface PaymentReversalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentResponse | null;
  customerName?: string;
  onSuccess?: (payment: PaymentResponse) => void;
}

export function PaymentReversalDialog({
  isOpen,
  onClose,
  payment,
  customerName,
  onSuccess,
}: PaymentReversalDialogProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEligible = payment && !payment.reversal;
  const isReasonValid = reason.trim().length > 0;

  const reversalMutation = useMutation({
    mutationFn: async () => {
      if (!payment) throw new Error("No payment selected");
      if (payment.reversal) throw new Error("Payment is already reversed.");
      if (!isReasonValid) throw new Error("A valid reversal reason is required.");

      return paymentsApi.reversePayment(payment.id, {
        reason: reason.trim(),
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
      handleClose();
    },
    onError: (err: any) => {
      const msg =
        err?.status === 409 || err?.message?.includes("409") || err?.message?.includes("already reversed")
          ? "Conflict: This payment is already reversed."
          : err.message || "Failed to reverse payment.";
      setErrorMessage(msg);
    },
  });

  const handleClose = () => {
    if (!reversalMutation.isPending) {
      setReason("");
      setErrorMessage(null);
      onClose();
    }
  };

  if (!isOpen || !payment) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        title="Reverse Payment Receipt"
        description="Void an authorized financial receipt and reinstate outstanding invoice balances."
        size="md"
      >
        <div className="space-y-4 text-sm">
          {/* Payment Context Summary */}
          <div className="bg-surface p-4 rounded-lg border border-surface-border space-y-2">
            <div className="flex justify-between items-center text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">Payment Information</span>
              <span>Ref: {payment.reference || payment.id.slice(0, 8)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-surface-border">
              <div>
                <span className="text-text-secondary block">Customer:</span>
                <span className="font-medium text-text-primary truncate block">
                  {customerName || payment.customer_id.slice(0, 8)}
                </span>
              </div>
              <div>
                <span className="text-text-secondary block">Amount:</span>
                <CurrencyDisplay amount={payment.amount} currency={payment.currency} className="font-bold text-text-primary" />
              </div>
              <div>
                <span className="text-text-secondary block">Allocated:</span>
                <CurrencyDisplay amount={payment.allocated_amount} currency={payment.currency} />
              </div>
              <div>
                <span className="text-text-secondary block">Active Allocations:</span>
                <span className="font-medium text-text-primary">{payment.allocations?.length || 0} Invoice(s)</span>
              </div>
            </div>
          </div>

          {/* Critical Accounting Warning */}
          <div className="p-3 bg-status-error-bg text-status-error text-xs rounded-lg flex items-start gap-2.5 border border-status-error/20">
            <AlertTriangle size={18} className="shrink-0 text-status-error mt-0.5" />
            <div className="space-y-1">
              <strong className="font-semibold">Irreversible Financial Impact:</strong>
              <p>
                Reversing this payment voids the receipt in ACCO financial ledgers. All {payment.allocations?.length || 0} active invoice allocations will be cancelled, reinstating outstanding debtor balances on affected invoices.
              </p>
            </div>
          </div>

          {/* Already Reversed Error */}
          {!isEligible && (
            <div className="p-3 bg-status-warning-bg text-status-warning text-xs rounded-lg flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>This payment is already reversed and cannot be reversed again.</span>
            </div>
          )}

          {/* Reason Input */}
          {isEligible && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
                Reversal Reason <span className="text-status-error">*</span>
              </label>
              <textarea
                placeholder="Required: Provide the official reason (e.g., Check bounced, Bank chargeback, Duplicate entry recorded in error)..."
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setErrorMessage(null);
                }}
                disabled={reversalMutation.isPending}
                rows={3}
                className="w-full px-3 py-2 border border-surface-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand text-sm resize-none"
                required
              />
            </div>
          )}

          {/* API Error Display */}
          {errorMessage && (
            <div className="p-3 bg-status-error-bg text-status-error text-xs rounded-lg flex items-center gap-2 border border-status-error/20">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={reversalMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!isEligible || !isReasonValid || reversalMutation.isPending}
            isLoading={reversalMutation.isPending}
            onClick={() => reversalMutation.mutate()}
          >
            Confirm Reversal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
