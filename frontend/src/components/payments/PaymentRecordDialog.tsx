"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { customersApi } from "@/lib/api/customers.api";
import { paymentsApi } from "@/lib/api/payments.api";
import { PaymentCreate, PaymentMethod, PaymentResponse } from "@/types/payment";
import { AlertTriangle, AlertCircle, ShieldAlert } from "lucide-react";

interface PaymentRecordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (payment: PaymentResponse) => void;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "BANK_TRANSFER", label: "Bank Transfer (NEFT/RTGS/IMPS/Wire)" },
  { value: "ONLINE", label: "Online Gateway / UPI" },
  { value: "CARD", label: "Credit / Debit Card" },
  { value: "CHEQUE", label: "Cheque / Demand Draft" },
  { value: "CASH", label: "Cash Receipt" },
  { value: "OTHER", label: "Other / Settlement" },
];

const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP", "SGD", "AED"];

export function PaymentRecordDialog({
  isOpen,
  onClose,
  onSuccess,
}: PaymentRecordDialogProps) {
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch active customers
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => customersApi.list({ include_inactive: false, limit: 100 }),
    enabled: isOpen,
  });

  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const isCustomerValid = !!customerId;
  const isDateValid = !!paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate);

  const canSubmit = isAmountValid && isCustomerValid && isDateValid;

  const recordMutation = useMutation({
    mutationFn: async () => {
      if (!canSubmit) throw new Error("Please fill out all required fields correctly.");
      const payload: PaymentCreate = {
        customer_id: customerId,
        amount: parsedAmount,
        currency: currency.toUpperCase(),
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      };
      return paymentsApi.recordPayment(payload);
    },
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
      if (onSuccess) {
        onSuccess(payment);
      }
      onClose();
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || "Failed to record payment receipt.");
    },
  });

  const handleClose = () => {
    if (!recordMutation.isPending) {
      setCustomerId("");
      setAmount("");
      setReference("");
      setNotes("");
      setErrorMessage(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        title="Record Payment Receipt"
        description="Record a verified financial receipt in ACCO. Unallocated funds can be reconciled against invoices subsequently."
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit && !recordMutation.isPending) {
              recordMutation.mutate();
            }
          }}
          className="space-y-4 text-sm"
        >
          {/* Financial Invariant Warning */}
          <div className="p-3 bg-brand/5 border border-brand/20 text-brand text-xs rounded-lg flex items-start gap-2.5">
            <ShieldAlert size={16} className="shrink-0 mt-0.5 text-brand" />
            <div>
              <strong className="font-semibold">Authoritative Financial Transaction:</strong> Recording a payment logs an immutable financial receipt. Ensure that actual funds have cleared or verifiable proof of transaction is on file.
            </div>
          </div>

          {/* Customer Selection */}
          <div className="space-y-1.5">
            <label htmlFor="customer-select" className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
              Customer <span className="text-status-error">*</span>
            </label>
            <select
              id="customer-select"
              aria-label="Select Customer"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setErrorMessage(null);
              }}
              disabled={isLoadingCustomers || recordMutation.isPending}
              className="w-full px-3 py-2 border border-surface-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand text-sm"
              required
            >
              <option value="">-- Select Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email || c.tax_identifier || c.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>

          {/* Amount & Currency Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
                Receipt Amount <span className="text-status-error">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setErrorMessage(null);
                }}
                disabled={recordMutation.isPending}
                className="w-full px-3 py-2 border border-surface-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand font-mono text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
                Currency <span className="text-status-error">*</span>
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={recordMutation.isPending}
                className="w-full px-3 py-2 border border-surface-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand text-sm"
              >
                {CURRENCY_OPTIONS.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Payment Date & Method Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
                Receipt Date <span className="text-status-error">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={recordMutation.isPending}
                className="w-full px-3 py-2 border border-surface-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
                Payment Method <span className="text-status-error">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                disabled={recordMutation.isPending}
                className="w-full px-3 py-2 border border-surface-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* External Reference */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
              Payment Reference / UTR / Check #
            </label>
            <input
              type="text"
              placeholder="e.g. UTR-20261011-88902 or CHQ-449102"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={recordMutation.isPending}
              maxLength={255}
              className="w-full px-3 py-2 border border-surface-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand text-sm font-mono"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
              Audit Notes
            </label>
            <textarea
              placeholder="Optional notes or remittance remarks..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={recordMutation.isPending}
              rows={2}
              className="w-full px-3 py-2 border border-surface-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand text-sm resize-none"
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-status-error-bg text-status-error text-xs rounded-lg flex items-center gap-2 border border-status-error/20">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <DialogFooter className="-mx-6 -mb-5 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={recordMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!canSubmit || recordMutation.isPending}
              isLoading={recordMutation.isPending}
            >
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
