"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { paymentsApi } from "@/lib/api/payments.api";
import { customersApi } from "@/lib/api/customers.api";
import { FilterBar } from "@/components/shared/FilterBar";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreditCard, Plus, Eye, Split, RotateCcw, ShieldAlert, ArrowUpDown, ChevronDown, CheckCircle2 } from "lucide-react";
import { formatDateShort } from "@/lib/formatting/dates";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useDemoMode } from "@/providers/DemoModeProvider";
import { PaymentResponse } from "@/types/payment";
import { PaymentRecordDialog } from "@/components/payments/PaymentRecordDialog";
import { PaymentAllocationDialog } from "@/components/payments/PaymentAllocationDialog";
import { PaymentReversalDialog } from "@/components/payments/PaymentReversalDialog";
import { PaymentDetailDrawer } from "@/components/payments/PaymentDetailDrawer";

type StatusFilter = "ALL" | "UNALLOCATED" | "PARTIAL" | "FULLY_ALLOCATED" | "REVERSED";
type SortOption = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export default function PaymentsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");
  const { isDemoMode } = useDemoMode();

  // Dialog & Drawer state
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [allocationPayment, setAllocationPayment] = useState<PaymentResponse | null>(null);
  const [reversalPayment, setReversalPayment] = useState<PaymentResponse | null>(null);
  const [selectedDrawerPayment, setSelectedDrawerPayment] = useState<PaymentResponse | null>(null);

  // Query payments
  const {
    data: payments = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["payments"],
    queryFn: () => paymentsApi.listPayments(),
  });

  // Query customer directory for mapping customer names
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-directory"],
    queryFn: () => customersApi.list({ limit: 100 }),
    staleTime: 60000,
  });

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => {
      map.set(c.id, c.name);
    });
    return map;
  }, [customers]);

  // Aggregate financial metrics
  const metrics = useMemo(() => {
    let totalReceived = 0;
    let totalAllocated = 0;
    let totalUnallocated = 0;
    let reversedCount = 0;

    payments.forEach((p) => {
      if (p.reversal) {
        reversedCount += 1;
      } else {
        totalReceived += Number(p.amount);
        totalAllocated += Number(p.allocated_amount);
        totalUnallocated += Number(p.unallocated_amount);
      }
    });

    return { totalReceived, totalAllocated, totalUnallocated, reversedCount };
  }, [payments]);

  // Filter & sort payments
  const filtered = useMemo(() => {
    return payments
      .filter((p) => {
        // Status filtering
        if (statusFilter === "REVERSED" && !p.reversal) return false;
        if (statusFilter === "FULLY_ALLOCATED" && (p.reversal || p.unallocated_amount > 0)) return false;
        if (statusFilter === "PARTIAL" && (p.reversal || p.allocated_amount <= 0 || p.unallocated_amount <= 0)) return false;
        if (statusFilter === "UNALLOCATED" && (p.reversal || p.allocated_amount > 0)) return false;

        // Search filtering (reference, customer_id, customer name, notes)
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const refMatch = p.reference?.toLowerCase().includes(term);
          const custIdMatch = p.customer_id.toLowerCase().includes(term);
          const custNameMatch = customerMap.get(p.customer_id)?.toLowerCase().includes(term);
          const notesMatch = p.notes?.toLowerCase().includes(term);
          if (!refMatch && !custIdMatch && !custNameMatch && !notesMatch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "date_desc") {
          return new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime();
        }
        if (sortBy === "date_asc") {
          return new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime();
        }
        if (sortBy === "amount_desc") {
          return Number(b.amount) - Number(a.amount);
        }
        if (sortBy === "amount_asc") {
          return Number(a.amount) - Number(b.amount);
        }
        return 0;
      });
  }, [payments, statusFilter, searchTerm, sortBy, customerMap]);

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Page Header */}
      <div className="p-6 border-b border-surface-border bg-white flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            Payments & Reconciliation
            {!isDemoMode ? (
              <Badge variant="success">Live API</Badge>
            ) : (
              <Badge variant="info">Demo Mode</Badge>
            )}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Audit recorded payment receipts, track unallocated cash float, and reconcile invoice balances.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            leftIcon={<Plus size={16} />}
            onClick={() => setIsRecordModalOpen(true)}
          >
            Record Payment
          </Button>
        </div>
      </div>

      {/* Accounting Invariant Warning Banner */}
      <div className="px-6 pt-5">
        <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-3 text-xs text-blue-900 shadow-xs">
          <ShieldAlert size={18} className="shrink-0 text-brand mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold block">Authoritative Cash Receipt Rule:</span>
            <span>
              Only verified recorded payments and approved allocations adjust debtor balances. Debtor promises, email intentions, or customer claims represent intentions and do not count as proof of receipt.
            </span>
          </div>
        </div>
      </div>

      {/* Financial Metrics Cards */}
      <div className="px-6 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-surface-border shadow-xs">
          <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
            Total Received
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <CurrencyDisplay amount={metrics.totalReceived} currency="INR" size="lg" className="font-bold text-text-primary" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-surface-border shadow-xs">
          <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
            Total Reconciled
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <CurrencyDisplay amount={metrics.totalAllocated} currency="INR" size="lg" className="font-semibold text-text-secondary" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-surface-border shadow-xs">
          <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
            Unallocated Float
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <CurrencyDisplay
              amount={metrics.totalUnallocated}
              currency="INR"
              size="lg"
              className={`font-bold ${metrics.totalUnallocated > 0 ? "text-brand" : "text-text-muted"}`}
            />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-surface-border shadow-xs">
          <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold block">
            Reversals
          </span>
          <div className="mt-1.5 flex items-baseline gap-2 font-mono text-lg font-bold text-status-error">
            {metrics.reversedCount}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-6 pt-4">
        <FilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search by reference, customer name, ID, or notes..."
          activeFilterCount={statusFilter !== "ALL" ? 1 : 0}
        />
      </div>

      {/* Status Filter Tabs & Sort Controls */}
      <div className="px-6 pt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "ALL", label: "All Receipts" },
              { id: "UNALLOCATED", label: "Unallocated Float" },
              { id: "PARTIAL", label: "Partially Allocated" },
              { id: "FULLY_ALLOCATED", label: "Fully Allocated" },
              { id: "REVERSED", label: "Reversed" },
            ] as const
          ).map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  active
                    ? "bg-brand text-white shadow-xs"
                    : "bg-white border border-surface-border text-text-secondary hover:text-text-primary hover:bg-surface"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-secondary font-medium">Sort By:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-2.5 py-1.5 bg-white border border-surface-border rounded-lg text-text-primary text-xs focus:ring-1 focus:ring-brand focus:outline-none"
          >
            <option value="date_desc">Received Date (Newest)</option>
            <option value="date_asc">Received Date (Oldest)</option>
            <option value="amount_desc">Amount (Highest)</option>
            <option value="amount_asc">Amount (Lowest)</option>
          </select>
        </div>
      </div>

      {/* Payments Table Area */}
      <div className="flex-1 overflow-auto p-6">
        {error ? (
          <div className="p-6 bg-status-error-bg text-status-error rounded-xl border border-status-error/20 flex flex-col items-start gap-3">
            <div className="font-semibold text-base">Error Loading Financial Payments</div>
            <p className="text-sm">{(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-surface-border shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Reference & Method</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Date Received</th>
                  <th className="px-4 py-3 font-medium text-right">Recorded Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Allocated</th>
                  <th className="px-4 py-3 font-medium text-right">Unallocated Float</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-text-muted">
                      Loading payments...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12">
                      <EmptyState
                        icon={CreditCard}
                        title="No payments found"
                        description={
                          searchTerm || statusFilter !== "ALL"
                            ? "No recorded payments matched your search or status filter."
                            : "There are currently no recorded payments in the system."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const isReversed = !!item.reversal;
                    const customerName = customerMap.get(item.customer_id);

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-surface/50 transition-colors group cursor-pointer"
                        onClick={() => setSelectedDrawerPayment(item)}
                      >
                        {/* Reference & Method */}
                        <td className="px-4 py-3.5 align-top">
                          <span className="font-medium text-text-primary block font-mono">
                            {item.reference || "No Reference"}
                          </span>
                          <span className="text-xs text-text-secondary mt-0.5 inline-block">
                            {item.payment_method.replace(/_/g, " ")}
                          </span>
                        </td>

                        {/* Customer */}
                        <td
                          className="px-4 py-3.5 align-top"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/customers/${item.customer_id}`}
                            className="text-brand hover:underline font-medium text-sm block"
                          >
                            {customerName || item.customer_id}
                          </Link>
                          {customerName && (
                            <span className="text-xs font-mono text-text-muted block">
                              {item.customer_id.slice(0, 8)}...
                            </span>
                          )}
                        </td>

                        {/* Date Received */}
                        <td className="px-4 py-3.5 align-top text-sm text-text-secondary">
                          {formatDateShort(item.payment_date)}
                        </td>

                        {/* Recorded Amount */}
                        <td className="px-4 py-3.5 align-top text-right font-medium">
                          <CurrencyDisplay
                            amount={item.amount}
                            currency={item.currency || "INR"}
                            className="font-semibold text-text-primary"
                          />
                          {isReversed && (
                            <div className="text-xs text-status-error font-medium mt-0.5">
                              Reversed
                            </div>
                          )}
                        </td>

                        {/* Allocated */}
                        <td className="px-4 py-3.5 align-top text-right">
                          <CurrencyDisplay
                            amount={item.allocated_amount}
                            currency={item.currency || "INR"}
                            className="text-text-secondary"
                          />
                        </td>

                        {/* Unallocated Float */}
                        <td className="px-4 py-3.5 align-top text-right font-mono">
                          <CurrencyDisplay
                            amount={item.unallocated_amount}
                            currency={item.currency || "INR"}
                            className={
                              item.unallocated_amount > 0 && !isReversed
                                ? "font-bold text-brand"
                                : "text-text-muted"
                            }
                          />
                        </td>

                        {/* Status Badge */}
                        <td className="px-4 py-3.5 align-top text-center">
                          {isReversed ? (
                            <Badge variant="error">REVERSED</Badge>
                          ) : item.unallocated_amount === 0 ? (
                            <Badge variant="success">FULLY ALLOCATED</Badge>
                          ) : item.allocated_amount > 0 ? (
                            <Badge variant="warning">PARTIAL</Badge>
                          ) : (
                            <Badge variant="muted">UNALLOCATED</Badge>
                          )}
                        </td>

                        {/* Actions */}
                        <td
                          className="px-4 py-3.5 align-top text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedDrawerPayment(item)}
                              title="View Receipt Details"
                              className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent hover:border-surface-border transition-colors"
                            >
                              <Eye size={15} />
                            </button>
                            {!isReversed && item.unallocated_amount > 0 && (
                              <button
                                onClick={() => setAllocationPayment(item)}
                                title="Allocate to Invoice"
                                className="p-1.5 rounded-lg text-brand hover:text-brand-dark hover:bg-brand/10 border border-transparent hover:border-brand/20 transition-colors"
                              >
                                <Split size={15} />
                              </button>
                            )}
                            {!isReversed && (
                              <button
                                onClick={() => setReversalPayment(item)}
                                title="Reverse Receipt"
                                className="p-1.5 rounded-lg text-status-error hover:text-red-700 hover:bg-status-error-bg border border-transparent hover:border-status-error/20 transition-colors"
                              >
                                <RotateCcw size={15} />
                              </button>
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

      {/* Record Payment Dialog */}
      <PaymentRecordDialog
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Allocation Dialog */}
      <PaymentAllocationDialog
        isOpen={!!allocationPayment}
        payment={allocationPayment}
        customerName={allocationPayment ? customerMap.get(allocationPayment.customer_id) : undefined}
        onClose={() => setAllocationPayment(null)}
        onSuccess={() => refetch()}
      />

      {/* Reversal Dialog */}
      <PaymentReversalDialog
        isOpen={!!reversalPayment}
        payment={reversalPayment}
        customerName={reversalPayment ? customerMap.get(reversalPayment.customer_id) : undefined}
        onClose={() => setReversalPayment(null)}
        onSuccess={() => refetch()}
      />

      {/* Payment Details Drawer */}
      <PaymentDetailDrawer
        payment={selectedDrawerPayment}
        customerName={selectedDrawerPayment ? customerMap.get(selectedDrawerPayment.customer_id) : undefined}
        onClose={() => setSelectedDrawerPayment(null)}
        onAllocate={(p) => {
          setSelectedDrawerPayment(null);
          setAllocationPayment(p);
        }}
        onReverse={(p) => {
          setSelectedDrawerPayment(null);
          setReversalPayment(p);
        }}
      />
    </div>
  );
}
