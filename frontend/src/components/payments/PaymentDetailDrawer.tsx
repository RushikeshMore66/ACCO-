"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PaymentResponse } from "@/types/payment";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateShort, formatDateTime } from "@/lib/formatting/dates";
import { X, ExternalLink, AlertTriangle, CheckCircle, Split, RotateCcw, ShieldAlert, ArrowRight } from "lucide-react";

interface PaymentDetailDrawerProps {
  payment: PaymentResponse | null;
  customerName?: string;
  onClose: () => void;
  onAllocate?: (payment: PaymentResponse) => void;
  onReverse?: (payment: PaymentResponse) => void;
}

export function PaymentDetailDrawer({
  payment,
  customerName,
  onClose,
  onAllocate,
  onReverse,
}: PaymentDetailDrawerProps) {
  if (!payment) return null;

  const isReversed = !!payment.reversal;
  const isFullyAllocated = !isReversed && payment.unallocated_amount === 0;
  const isPartial = !isReversed && payment.allocated_amount > 0 && payment.unallocated_amount > 0;
  const isUnallocated = !isReversed && payment.allocated_amount === 0;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-white border-l border-surface-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-5 border-b border-surface-border flex items-center justify-between bg-surface/50">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-text-primary">
              Receipt Details
            </h2>
            {isReversed ? (
              <Badge variant="error">REVERSED</Badge>
            ) : isFullyAllocated ? (
              <Badge variant="success">FULLY ALLOCATED</Badge>
            ) : isPartial ? (
              <Badge variant="warning">PARTIAL</Badge>
            ) : (
              <Badge variant="muted">UNALLOCATED</Badge>
            )}
          </div>
          <p className="text-xs font-mono text-text-secondary">
            {payment.reference || `ID: ${payment.id}`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
          aria-label="Close details"
        >
          <X size={18} />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm">
        {/* Reversal Banner if reversed */}
        {isReversed && (
          <div className="p-4 bg-status-error-bg text-status-error rounded-xl border border-status-error/20 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wider">
              <RotateCcw size={16} />
              <span>Payment Reversal Audit Record</span>
            </div>
            <div className="text-xs space-y-1">
              <div>
                <span className="text-text-secondary">Reversed At:</span>{" "}
                <span className="font-medium text-text-primary">
                  {formatDateTime(payment.reversal!.reversed_at)}
                </span>
              </div>
              <div>
                <span className="text-text-secondary">Reason:</span>{" "}
                <span className="font-semibold text-status-error">
                  {payment.reversal!.reason}
                </span>
              </div>
            </div>
            <p className="text-xs text-text-secondary pt-1 border-t border-status-error/10">
              Allocations are voided. This receipt does not reduce debtor balances.
            </p>
          </div>
        )}

        {/* Financial Balances Card */}
        <div className="bg-surface rounded-xl p-4 border border-surface-border space-y-3">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Financial Balance Breakdown
          </h3>
          <div className="grid grid-cols-3 gap-3 pt-1 text-center">
            <div className="p-2.5 bg-white rounded-lg border border-surface-border">
              <span className="text-xs text-text-secondary block mb-1">Total Recorded</span>
              <CurrencyDisplay amount={payment.amount} currency={payment.currency} size="lg" className="font-bold" />
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-surface-border">
              <span className="text-xs text-text-secondary block mb-1">Allocated</span>
              <CurrencyDisplay amount={payment.allocated_amount} currency={payment.currency} size="lg" className="text-text-secondary" />
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-surface-border">
              <span className="text-xs text-text-secondary block mb-1">Unallocated Float</span>
              <CurrencyDisplay
                amount={payment.unallocated_amount}
                currency={payment.currency}
                size="lg"
                className={`font-bold ${payment.unallocated_amount > 0 ? "text-brand" : "text-text-muted"}`}
              />
            </div>
          </div>
        </div>

        {/* Customer & Transaction Metadata */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Transaction Information
          </h3>
          <div className="border border-surface-border rounded-xl divide-y divide-surface-border text-xs">
            <div className="p-3 flex justify-between items-center">
              <span className="text-text-secondary">Customer</span>
              <Link
                href={`/customers/${payment.customer_id}`}
                className="font-medium text-brand hover:underline flex items-center gap-1"
              >
                {customerName || payment.customer_id}
                <ExternalLink size={12} />
              </Link>
            </div>
            <div className="p-3 flex justify-between items-center">
              <span className="text-text-secondary">Payment Method</span>
              <span className="font-medium text-text-primary">
                {payment.payment_method.replace(/_/g, " ")}
              </span>
            </div>
            <div className="p-3 flex justify-between items-center">
              <span className="text-text-secondary">Date Received</span>
              <span className="font-medium text-text-primary">
                {formatDateShort(payment.payment_date)}
              </span>
            </div>
            <div className="p-3 flex justify-between items-center">
              <span className="text-text-secondary">Recorded At</span>
              <span className="font-medium text-text-primary">
                {formatDateTime(payment.created_at)}
              </span>
            </div>
            {payment.reference && (
              <div className="p-3 flex justify-between items-center">
                <span className="text-text-secondary">External Reference</span>
                <span className="font-mono font-medium text-text-primary">
                  {payment.reference}
                </span>
              </div>
            )}
            {payment.notes && (
              <div className="p-3 space-y-1">
                <span className="text-text-secondary block">Notes</span>
                <p className="text-text-primary italic bg-surface p-2 rounded">
                  {payment.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Allocations History */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Allocated Invoices ({payment.allocations?.length || 0})
            </h3>
            {!isReversed && payment.unallocated_amount > 0 && onAllocate && (
              <button
                onClick={() => onAllocate(payment)}
                className="text-xs text-brand font-medium hover:underline flex items-center gap-1"
              >
                <Split size={12} /> Allocate Cash
              </button>
            )}
          </div>

          {(!payment.allocations || payment.allocations.length === 0) ? (
            <div className="p-4 border border-dashed border-surface-border rounded-xl text-center text-xs text-text-secondary bg-surface/50">
              No allocations recorded for this payment yet.
            </div>
          ) : (
            <div className="border border-surface-border rounded-xl divide-y divide-surface-border overflow-hidden">
              {payment.allocations.map((alloc) => (
                <div key={alloc.id} className="p-3 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-text-primary">Invoice:</span>
                      <Link
                        href={`/invoices/${alloc.invoice_id}`}
                        className="text-brand hover:underline font-mono flex items-center gap-1"
                      >
                        {alloc.invoice_id.slice(0, 13)}...
                        <ExternalLink size={10} />
                      </Link>
                    </div>
                    <span className="text-text-secondary text-[11px]">
                      Allocated on {formatDateShort(alloc.created_at)}
                    </span>
                  </div>
                  <div className="text-right">
                    <CurrencyDisplay
                      amount={alloc.amount}
                      currency={payment.currency}
                      className="font-bold text-text-primary"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Legal & Invariant Notice */}
        <div className="p-3.5 bg-surface border border-surface-border rounded-xl text-xs space-y-1 text-text-secondary">
          <div className="flex items-center gap-1.5 font-semibold text-text-primary">
            <ShieldAlert size={14} className="text-brand" />
            <span>Financial Accounting Invariant</span>
          </div>
          <p>
            Only recorded receipts and validated allocations decrease debtor balances. Debtor promises, email intentions, or portal messages are non-binding and do not affect accounting ledgers.
          </p>
        </div>
      </div>

      {/* Drawer Footer Actions */}
      <div className="p-4 border-t border-surface-border bg-surface flex items-center justify-end gap-3">
        {!isReversed && onReverse && (
          <Button
            type="button"
            variant="ghost"
            className="text-status-error hover:bg-status-error-bg text-xs"
            onClick={() => onReverse(payment)}
          >
            Reverse Payment
          </Button>
        )}
        {!isReversed && payment.unallocated_amount > 0 && onAllocate && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => onAllocate(payment)}
            leftIcon={<Split size={14} />}
          >
            Allocate Payment
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
