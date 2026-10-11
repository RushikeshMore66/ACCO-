"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/lib/api/collections.api";
import { invoicesApi } from "@/lib/api/invoices.api";
import { customersApi } from "@/lib/api/customers.api";
import { isDemoMode } from "@/lib/api/client";
import { FilterBar } from "@/components/shared/FilterBar";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import {
  Handshake,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Search,
  XCircle,
  AlertCircle,
  CheckCircle2,
  Calendar
} from "lucide-react";
import { formatDateShort } from "@/lib/formatting/dates";
import { useAuth } from "@/providers/AuthProvider";
import { PaymentPromise, PromiseStatus } from "@/types/promises_disputes";
import Link from "next/link";

export default function PromisesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("expected_asc");

  // Invoice-scoped lookup in live mode
  const [lookupInvoiceId, setLookupInvoiceId] = useState("");
  const [activeLookupId, setActiveLookupId] = useState<string | null>(null);

  // Cancellation dialog state
  const [cancellingPromise, setCancellingPromise] = useState<PaymentPromise | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Global promise query
  const {
    data: promises = [],
    isLoading,
    isError,
    error: globalQueryError,
  } = useQuery({
    queryKey: ["promises"],
    queryFn: () => collectionsApi.listAllPromises(),
    retry: false,
  });

  // Invoice-scoped query for live fallback
  const {
    data: scopedPromises = [],
    isLoading: isScopedLoading,
    isError: isScopedError,
  } = useQuery({
    queryKey: ["invoice-promises", activeLookupId],
    queryFn: () => collectionsApi.getPromises(activeLookupId!),
    enabled: Boolean(activeLookupId),
    retry: false,
  });

  // Reference lookups for customer and invoice names
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices-reference"],
    queryFn: () => invoicesApi.list({ limit: 100 }),
    staleTime: 60000,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-reference"],
    queryFn: () => customersApi.list({ limit: 100 }),
    staleTime: 60000,
  });

  const invoiceMap = useMemo(() => {
    const map = new Map<string, { invoice_number: string; customer_id: string; currency: string }>();
    invoices.forEach((inv) => map.set(inv.id, { invoice_number: inv.invoice_number, customer_id: inv.customer_id, currency: inv.currency }));
    return map;
  }, [invoices]);

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  // Cancel promise mutation
  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return collectionsApi.cancelPromise(id, { cancellation_reason: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promises"] });
      if (activeLookupId) {
        queryClient.invalidateQueries({ queryKey: ["invoice-promises", activeLookupId] });
      }
      setCancellingPromise(null);
      setCancellationReason("");
      setCancelError(null);
    },
    onError: (err: any) => {
      setCancelError(err?.message || "Failed to cancel promise");
    },
  });

  const handleCancelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellationReason.trim()) {
      setCancelError("A cancellation reason is required.");
      return;
    }
    if (cancellingPromise) {
      cancelMutation.mutate({ id: cancellingPromise.id, reason: cancellationReason });
    }
  };

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lookupInvoiceId.trim()) {
      setActiveLookupId(lookupInvoiceId.trim());
    }
  };

  const dataset = isError && activeLookupId ? scopedPromises : promises;

  const filtered = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    return dataset.filter((p) => {
      const invMeta = invoiceMap.get(p.invoice_id);
      const invNumber = invMeta?.invoice_number || p.invoice_id;
      const custId = p.customer_id || invMeta?.customer_id || "";
      const custName = customerMap.get(custId) || custId;

      // Search matching
      const matchesSearch =
        searchTerm === "" ||
        p.invoice_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        custName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.notes && p.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // Status filtering
      if (!statusFilter) return true;
      if (statusFilter === "DUE_SOON") {
        return (
          p.status === "ACTIVE" &&
          p.expected_payment_date >= today &&
          p.expected_payment_date <= nextWeek
        );
      }
      return p.status === statusFilter;
    });
  }, [dataset, searchTerm, statusFilter, invoiceMap, customerMap]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "expected_asc":
          return a.expected_payment_date.localeCompare(b.expected_payment_date);
        case "expected_desc":
          return b.expected_payment_date.localeCompare(a.expected_payment_date);
        case "follow_up_asc":
          return (a.follow_up_date || a.expected_payment_date).localeCompare(b.follow_up_date || b.expected_payment_date);
        case "amount_desc":
          return Number(b.promised_amount) - Number(a.promised_amount);
        case "amount_asc":
          return Number(a.promised_amount) - Number(b.promised_amount);
        case "created_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });
  }, [filtered, sortBy]);

  const canMutate = user ? user.role !== "VIEWER" : true;

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Financial Invariant Header Banner */}
      <div className="bg-brand-lavender/30 border-b border-brand/20 px-6 py-2.5 flex items-center justify-between text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-brand shrink-0" />
          <span>
            <strong className="text-brand font-semibold">Payment Promise Governance:</strong> Payment promises track debtor commitments. Promises do not reduce invoice outstanding balances until verified payments are allocated.
          </span>
        </div>
        {isDemoMode && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20">
            Demo Mode Active
          </span>
        )}
      </div>

      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by invoice, customer, or notes..."
        activeFilterCount={(statusFilter ? 1 : 0) + (sortBy !== "expected_asc" ? 1 : 0)}
        onClearFilters={() => {
          setStatusFilter("");
          setSortBy("expected_asc");
          setSearchTerm("");
        }}
        filters={[
          {
            key: "status",
            label: "Filter Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { label: "All Statuses", value: "" },
              { label: "Active", value: "ACTIVE" },
              { label: "Due Soon (Next 7 Days)", value: "DUE_SOON" },
              { label: "Fulfilled", value: "FULFILLED" },
              { label: "Missed", value: "MISSED" },
              { label: "Cancelled", value: "CANCELLED" },
            ],
          },
          {
            key: "sort",
            label: "Sort By",
            value: sortBy,
            onChange: setSortBy,
            options: [
              { label: "Expected Date (Earliest First)", value: "expected_asc" },
              { label: "Expected Date (Latest First)", value: "expected_desc" },
              { label: "Follow-up Date (Earliest)", value: "follow_up_asc" },
              { label: "Amount: High to Low", value: "amount_desc" },
              { label: "Amount: Low to High", value: "amount_asc" },
              { label: "Created Date: Newest", value: "created_desc" },
            ],
          },
        ]}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Notice for Live Backend Limitation */}
        {isError && !activeLookupId && (
          <div className="bg-white rounded-lg border border-surface-border p-6 shadow-sm space-y-4">
            <EmptyState
              icon={Handshake}
              title="Global Promise List Unavailable"
              description="The live ACCO FastAPI backend does not expose an organization-wide promises list. Payment promise operations are canonical and scoped to individual invoices."
            />
            <div className="max-w-md mx-auto space-y-3">
              <form onSubmit={handleLookupSubmit} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter Invoice ID (e.g. inv-1)..."
                  value={lookupInvoiceId}
                  onChange={(e) => setLookupInvoiceId(e.target.value)}
                  className="flex-1 p-2 text-sm border border-surface-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <Button variant="primary" size="sm" type="submit" disabled={!lookupInvoiceId.trim()}>
                  <Search size={14} className="mr-1" />
                  View Invoice Promises
                </Button>
              </form>
              <div className="text-xs text-text-muted text-center">
                Or navigate to the{" "}
                <Link href="/invoices" className="text-brand hover:underline font-medium">
                  Invoices Directory
                </Link>{" "}
                to manage promises on specific accounts.
              </div>
            </div>
          </div>
        )}

        {/* Invoice Lookup Header when active */}
        {activeLookupId && (
          <div className="bg-surface-elevated p-3.5 rounded-lg border border-surface-border flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">Viewing Promises for Invoice:</span>
              <span className="font-mono font-bold text-text-primary">{activeLookupId}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveLookupId(null);
                setLookupInvoiceId("");
              }}
            >
              Reset Lookup
            </Button>
          </div>
        )}

        {/* Promises Table */}
        {(!isError || activeLookupId) && (
          <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Customer & Invoice</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Promised Amount</th>
                  <th className="px-4 py-3 font-medium">Expected Date</th>
                  <th className="px-4 py-3 font-medium">Follow-up Date</th>
                  <th className="px-4 py-3 font-medium">Intelligence / Notes</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {isLoading || (isScopedLoading && activeLookupId) ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                      Loading payment promises...
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8">
                      <EmptyState
                        icon={Handshake}
                        title="No payment promises found"
                        description={
                          searchTerm || statusFilter
                            ? "No payment promises match your selected filters."
                            : "There are currently no active or historical payment promises."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  sorted.map((item) => {
                    const invMeta = invoiceMap.get(item.invoice_id);
                    const invNumber = invMeta?.invoice_number || item.invoice_id;
                    const custId = item.customer_id || invMeta?.customer_id;
                    const custName = custId ? customerMap.get(custId) || custId : "Customer";
                    const isOverdue =
                      item.status === "ACTIVE" &&
                      item.expected_payment_date < new Date().toISOString().split("T")[0];

                    return (
                      <tr key={item.id} className="hover:bg-surface/50 transition-colors group">
                        {/* Customer & Invoice identity */}
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-semibold text-text-primary text-sm">
                            {custId ? (
                              <Link
                                href={`/customers/${custId}`}
                                className="hover:text-brand transition-colors hover:underline"
                              >
                                {custName}
                              </Link>
                            ) : (
                              custName
                            )}
                          </div>
                          <div className="text-xs font-mono text-text-secondary mt-0.5 flex items-center gap-1.5">
                            <Link
                              href={`/invoices/${item.invoice_id}`}
                              className="hover:text-brand transition-colors hover:underline font-medium"
                            >
                              {invNumber}
                            </Link>
                            {invNumber !== item.invoice_id && (
                              <span className="text-[11px] text-text-muted">({item.invoice_id})</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 align-top text-center">
                          <StatusBadge type="promise" status={item.status} />
                          {isOverdue && (
                            <div className="text-[10px] text-status-error font-medium mt-1">
                              Past Expected Date
                            </div>
                          )}
                        </td>

                        {/* Promised Amount */}
                        <td className="px-4 py-3.5 align-top text-right">
                          <CurrencyDisplay
                            amount={item.promised_amount}
                            currency={item.currency || invMeta?.currency || "INR"}
                            size="md"
                            className="font-semibold text-text-primary"
                          />
                        </td>

                        {/* Expected Payment Date */}
                        <td className="px-4 py-3.5 align-top text-sm">
                          <div className={isOverdue ? "text-status-error font-semibold" : "text-text-primary"}>
                            {formatDateShort(item.expected_payment_date)}
                          </div>
                        </td>

                        {/* Follow-up Date */}
                        <td className="px-4 py-3.5 align-top text-sm text-text-secondary">
                          {item.follow_up_date ? formatDateShort(item.follow_up_date) : "—"}
                        </td>

                        {/* Intelligence / Notes */}
                        <td className="px-4 py-3.5 align-top text-xs max-w-xs">
                          {item.reply_analysis_id && (
                            <div className="mb-1">
                              <Link
                                href="/communications"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand bg-brand/5 border border-brand/20 px-1.5 py-0.5 rounded hover:bg-brand/10 transition-colors"
                              >
                                <Sparkles size={11} />
                                Linked AI Reply
                              </Link>
                            </div>
                          )}
                          {item.notes ? (
                            <div className="text-text-secondary line-clamp-2">
                              {item.notes}
                            </div>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 align-top text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/invoices/${item.invoice_id}`}
                              className="text-xs text-text-secondary hover:text-brand font-medium inline-flex items-center gap-1"
                            >
                              <ExternalLink size={13} />
                              Invoice
                            </Link>

                            {item.status === "ACTIVE" && canMutate && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setCancellingPromise(item);
                                  setCancellationReason("");
                                  setCancelError(null);
                                }}
                                className="text-xs py-1 h-7 border-status-error/30 text-status-error hover:bg-status-error/5"
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cancel Promise Dialog */}
      {cancellingPromise && (
        <Dialog open={Boolean(cancellingPromise)} onOpenChange={(open) => !open && setCancellingPromise(null)}>
          <DialogContent title="Cancel Payment Promise">
            <form onSubmit={handleCancelSubmit} className="space-y-4">
              {cancelError && (
                <div className="p-3 bg-status-error/10 border border-status-error/20 text-status-error text-sm rounded-md flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{cancelError}</span>
                </div>
              )}

              <div className="bg-surface-elevated p-3 rounded-lg border border-surface-border text-xs space-y-1">
                <div>
                  Invoice: <strong className="font-mono text-text-primary">{cancellingPromise.invoice_id}</strong>
                </div>
                <div>
                  Promised Amount:{" "}
                  <strong className="text-text-primary">
                    <CurrencyDisplay
                      amount={cancellingPromise.promised_amount}
                      currency={cancellingPromise.currency || "INR"}
                    />
                  </strong>
                </div>
                <div>
                  Expected Date:{" "}
                  <strong className="text-text-primary">
                    {formatDateShort(cancellingPromise.expected_payment_date)}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Cancellation Reason (Required by backend policy)
                </label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="e.g. Debtor requested revised invoice terms before remitting..."
                  rows={3}
                  required
                  className="w-full p-2.5 border border-surface-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                  disabled={cancelMutation.isPending}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-surface-border">
                <Button
                  variant="outline"
                  onClick={() => setCancellingPromise(null)}
                  type="button"
                  disabled={cancelMutation.isPending}
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={cancelMutation.isPending || !cancellationReason.trim()}
                  className="bg-status-error hover:bg-status-error/90 text-white"
                >
                  <XCircle size={14} className="mr-1.5" />
                  {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancellation"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

