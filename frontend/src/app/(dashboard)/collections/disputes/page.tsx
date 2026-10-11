"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "@/lib/api/collections.api";
import { invoicesApi } from "@/lib/api/invoices.api";
import { customersApi } from "@/lib/api/customers.api";
import { isDemoMode } from "@/lib/api/client";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import {
  AlertTriangle,
  FileWarning,
  ExternalLink,
  ShieldAlert,
  Search,
  CheckCircle2,
  XCircle,
  PlayCircle,
  AlertCircle,
  Info,
  Plus
} from "lucide-react";
import { formatDateShort, formatDateTime } from "@/lib/formatting/dates";
import { useAuth } from "@/providers/AuthProvider";
import { Dispute, DisputeCategory, DisputeStatus } from "@/types/promises_disputes";
import Link from "next/link";

const CANONICAL_CATEGORIES: { label: string; value: DisputeCategory }[] = [
  { label: "Incorrect Amount", value: "INCORRECT_AMOUNT" },
  { label: "Duplicate Invoice", value: "DUPLICATE_INVOICE" },
  { label: "Service / Product Issue", value: "SERVICE_OR_PRODUCT_ISSUE" },
  { label: "Tax / Billing Issue", value: "TAX_OR_BILLING_ISSUE" },
  { label: "Payment Already Made", value: "PAYMENT_ALREADY_MADE" },
  { label: "Other", value: "OTHER" },
];

function formatCategoryLabel(cat: string): string {
  const found = CANONICAL_CATEGORIES.find((c) => c.value === cat);
  if (found) return found.label;
  return cat.replace(/_/g, " ");
}

export default function DisputesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("created_desc");

  // Invoice-scoped lookup in live mode
  const [lookupInvoiceId, setLookupInvoiceId] = useState("");
  const [activeLookupId, setActiveLookupId] = useState<string | null>(null);

  // Resolution / Rejection dialog state
  const [resolvingDispute, setResolvingDispute] = useState<Dispute | null>(null);
  const [resolutionAction, setResolutionAction] = useState<"RESOLVE" | "REJECT">("RESOLVE");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  // New dispute dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newInvoiceId, setNewInvoiceId] = useState("");
  const [newCategory, setNewCategory] = useState<DisputeCategory>("INCORRECT_AMOUNT");
  const [newDescription, setNewDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Global dispute query
  const {
    data: disputes = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["disputes"],
    queryFn: () => collectionsApi.listAllDisputes(),
    retry: false,
  });

  // Invoice-scoped query for live fallback
  const {
    data: scopedDisputes = [],
    isLoading: isScopedLoading,
  } = useQuery({
    queryKey: ["invoice-disputes", activeLookupId],
    queryFn: () => collectionsApi.getDisputes(activeLookupId!),
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
    const map = new Map<string, { invoice_number: string; customer_id: string }>();
    invoices.forEach((inv) => map.set(inv.id, { invoice_number: inv.invoice_number, customer_id: inv.customer_id }));
    return map;
  }, [invoices]);

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  // Mutations
  const startReviewMutation = useMutation({
    mutationFn: (id: string) => collectionsApi.startDisputeReview(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disputes"] });
      if (activeLookupId) queryClient.invalidateQueries({ queryKey: ["invoice-disputes", activeLookupId] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      collectionsApi.resolveDispute(id, { resolution_notes: notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disputes"] });
      if (activeLookupId) queryClient.invalidateQueries({ queryKey: ["invoice-disputes", activeLookupId] });
      setResolvingDispute(null);
      setResolutionNotes("");
      setResolutionError(null);
    },
    onError: (err: any) => {
      setResolutionError(err?.message || "Failed to resolve dispute");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      collectionsApi.rejectDispute(id, { rejection_reason: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disputes"] });
      if (activeLookupId) queryClient.invalidateQueries({ queryKey: ["invoice-disputes", activeLookupId] });
      setResolvingDispute(null);
      setResolutionNotes("");
      setResolutionError(null);
    },
    onError: (err: any) => {
      setResolutionError(err?.message || "Failed to reject dispute");
    },
  });

  const createDisputeMutation = useMutation({
    mutationFn: ({ invoiceId, data }: { invoiceId: string; data: { category: DisputeCategory; description: string } }) =>
      collectionsApi.createDispute(invoiceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disputes"] });
      if (activeLookupId) queryClient.invalidateQueries({ queryKey: ["invoice-disputes", activeLookupId] });
      setIsCreateOpen(false);
      setNewInvoiceId("");
      setNewDescription("");
      setCreateError(null);
    },
    onError: (err: any) => {
      setCreateError(err?.message || "Failed to create dispute");
    },
  });

  const handleResolutionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) {
      setResolutionError("Resolution notes or rejection reason are required.");
      return;
    }
    if (!resolvingDispute) return;

    if (resolutionAction === "RESOLVE") {
      resolveMutation.mutate({ id: resolvingDispute.id, notes: resolutionNotes });
    } else {
      rejectMutation.mutate({ id: resolvingDispute.id, reason: resolutionNotes });
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvoiceId.trim() || !newDescription.trim()) {
      setCreateError("Invoice ID and description are required.");
      return;
    }
    createDisputeMutation.mutate({
      invoiceId: newInvoiceId.trim(),
      data: { category: newCategory, description: newDescription.trim() },
    });
  };

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lookupInvoiceId.trim()) {
      setActiveLookupId(lookupInvoiceId.trim());
    }
  };

  const dataset = isError && activeLookupId ? scopedDisputes : disputes;

  const filtered = useMemo(() => {
    return dataset.filter((d) => {
      const invMeta = invoiceMap.get(d.invoice_id);
      const invNumber = invMeta?.invoice_number || d.invoice_id;
      const custId = d.customer_id || invMeta?.customer_id || "";
      const custName = customerMap.get(custId) || custId;

      const matchesSearch =
        searchTerm === "" ||
        d.invoice_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        custName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.resolution_notes && d.resolution_notes.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      if (statusFilter && d.status !== statusFilter) return false;
      if (categoryFilter && d.category !== categoryFilter) return false;

      return true;
    });
  }, [dataset, searchTerm, statusFilter, categoryFilter, invoiceMap, customerMap]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "created_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "status":
          return a.status.localeCompare(b.status);
        case "category":
          return a.category.localeCompare(b.category);
        default:
          return 0;
      }
    });
  }, [filtered, sortBy]);

  // Role permissions
  // OWNER & FINANCE_MANAGER can resolve/reject; COLLECTOR, FM & OWNER can start review or create
  const userRole = user?.role;
  const canStartReview = !userRole || userRole === "OWNER" || userRole === "FINANCE_MANAGER" || userRole === "COLLECTOR";
  const canResolveOrReject = !userRole || userRole === "OWNER" || userRole === "FINANCE_MANAGER";
  const canCreate = !userRole || userRole !== "VIEWER";

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Dispute Financial Integrity Banner */}
      <div className="bg-status-warning/10 border-b border-status-warning/20 px-6 py-2.5 flex items-center justify-between text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className="text-status-warning shrink-0" />
          <span>
            <strong className="text-text-primary font-semibold">Dispute Protocol:</strong> Active disputes halt automated dunning workflows. Resolving or rejecting a dispute records operational adjudication; it does NOT record receipt of payment or reduce invoice balances.
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
        searchPlaceholder="Search by invoice, customer, or description..."
        activeFilterCount={(statusFilter ? 1 : 0) + (categoryFilter ? 1 : 0) + (sortBy !== "created_desc" ? 1 : 0)}
        onClearFilters={() => {
          setStatusFilter("");
          setCategoryFilter("");
          setSortBy("created_desc");
          setSearchTerm("");
        }}
        actions={
          canCreate && (
            <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus size={14} className="mr-1.5" />
              Open Dispute
            </Button>
          )
        }
        filters={[
          {
            key: "status",
            label: "Filter Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { label: "All Statuses", value: "" },
              { label: "Open", value: "OPEN" },
              { label: "Under Review", value: "UNDER_REVIEW" },
              { label: "Resolved", value: "RESOLVED" },
              { label: "Rejected", value: "REJECTED" },
            ],
          },
          {
            key: "category",
            label: "Filter Category",
            value: categoryFilter,
            onChange: setCategoryFilter,
            options: [
              { label: "All Categories", value: "" },
              ...CANONICAL_CATEGORIES.map((c) => ({ label: c.label, value: c.value })),
            ],
          },
          {
            key: "sort",
            label: "Sort By",
            value: sortBy,
            onChange: setSortBy,
            options: [
              { label: "Created Date (Newest First)", value: "created_desc" },
              { label: "Created Date (Oldest First)", value: "created_asc" },
              { label: "Dispute Status", value: "status" },
              { label: "Category", value: "category" },
            ],
          },
        ]}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Notice for Live Backend Limitation */}
        {isError && !activeLookupId && (
          <div className="bg-white rounded-lg border border-surface-border p-6 shadow-sm space-y-4">
            <EmptyState
              icon={AlertTriangle}
              title="Global Dispute List Unavailable"
              description="The live ACCO FastAPI backend does not expose an organization-wide disputes list. Dispute operations are canonical and scoped to individual invoices."
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
                  View Invoice Disputes
                </Button>
              </form>
              <div className="text-xs text-text-muted text-center">
                Or navigate to the{" "}
                <Link href="/invoices" className="text-brand hover:underline font-medium">
                  Invoices Directory
                </Link>{" "}
                to manage disputes on specific invoices.
              </div>
            </div>
          </div>
        )}

        {/* Active Lookup Reset Bar */}
        {activeLookupId && (
          <div className="bg-surface-elevated p-3.5 rounded-lg border border-surface-border flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-text-secondary">Viewing Disputes for Invoice:</span>
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

        {/* Disputes Table */}
        {(!isError || activeLookupId) && (
          <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="px-4 py-3 font-medium">Customer & Invoice</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Description & Evidence</th>
                  <th className="px-4 py-3 font-medium">Resolution Notes</th>
                  <th className="px-4 py-3 font-medium">Opened At</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {isLoading || (isScopedLoading && activeLookupId) ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                      Loading disputes...
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8">
                      <EmptyState
                        icon={AlertTriangle}
                        title="No disputes found"
                        description={
                          searchTerm || statusFilter || categoryFilter
                            ? "No disputes match your selected filter criteria."
                            : "There are currently no active or historical dispute records."
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
                    const isPaymentClaim = item.category === "PAYMENT_ALREADY_MADE" || item.category === "ALREADY_PAID";

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
                          <StatusBadge type="dispute" status={item.status} />
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3.5 align-top">
                          <Badge variant="muted" className="text-xs">
                            {formatCategoryLabel(item.category)}
                          </Badge>
                          {isPaymentClaim && (
                            <div className="text-[10px] text-status-warning font-medium mt-1 flex items-center gap-1">
                              <Info size={10} />
                              Unverified claim
                            </div>
                          )}
                        </td>

                        {/* Description & Evidence */}
                        <td className="px-4 py-3.5 align-top text-xs max-w-xs text-text-primary">
                          <p className="line-clamp-2">{item.description}</p>
                        </td>

                        {/* Resolution Notes */}
                        <td className="px-4 py-3.5 align-top text-xs max-w-xs text-text-secondary">
                          {item.resolution_notes ? (
                            <div>
                              <p className="line-clamp-2">{item.resolution_notes}</p>
                              {item.resolved_at && (
                                <div className="text-[11px] text-text-muted mt-0.5">
                                  Resolved: {formatDateShort(item.resolved_at)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>

                        {/* Opened At */}
                        <td className="px-4 py-3.5 align-top text-xs text-text-muted">
                          {formatDateShort(item.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 align-top text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <Link
                              href={`/invoices/${item.invoice_id}`}
                              className="text-xs text-text-secondary hover:text-brand font-medium inline-flex items-center gap-1 mr-1"
                            >
                              <ExternalLink size={13} />
                              Invoice
                            </Link>

                            {/* Start Review for OPEN disputes */}
                            {item.status === "OPEN" && canStartReview && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startReviewMutation.mutate(item.id)}
                                disabled={startReviewMutation.isPending}
                                className="text-xs py-1 h-7"
                              >
                                <PlayCircle size={12} className="mr-1" />
                                Review
                              </Button>
                            )}

                            {/* Resolve & Reject for OPEN or UNDER_REVIEW disputes */}
                            {(item.status === "OPEN" || item.status === "UNDER_REVIEW") && canResolveOrReject && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setResolvingDispute(item);
                                    setResolutionAction("RESOLVE");
                                    setResolutionNotes("");
                                    setResolutionError(null);
                                  }}
                                  className="text-xs py-1 h-7 text-status-success border-status-success/30 hover:bg-status-success/5"
                                >
                                  Resolve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setResolvingDispute(item);
                                    setResolutionAction("REJECT");
                                    setResolutionNotes("");
                                    setResolutionError(null);
                                  }}
                                  className="text-xs py-1 h-7 text-status-error border-status-error/30 hover:bg-status-error/5"
                                >
                                  Reject
                                </Button>
                              </>
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

      {/* Resolve / Reject Dispute Dialog */}
      {resolvingDispute && (
        <Dialog open={Boolean(resolvingDispute)} onOpenChange={(open) => !open && setResolvingDispute(null)}>
          <DialogContent
            title={resolutionAction === "RESOLVE" ? "Resolve Customer Dispute" : "Reject Customer Dispute"}
          >
            <form onSubmit={handleResolutionSubmit} className="space-y-4">
              {resolutionError && (
                <div className="p-3 bg-status-error/10 border border-status-error/20 text-status-error text-sm rounded-md flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{resolutionError}</span>
                </div>
              )}

              {/* Financial Guardrail Alert */}
              <div className="p-3 bg-brand-lavender/40 border border-brand/20 rounded-lg text-xs text-text-secondary flex items-start gap-2">
                <Info size={15} className="mt-0.5 shrink-0 text-brand" />
                <div>
                  <strong className="text-brand font-semibold block">Authoritative Accounting Rule:</strong>
                  {resolutionAction === "RESOLVE"
                    ? "Resolving this dispute records the customer resolution notes. It does NOT automatically record payment receipt or change outstanding invoice balances."
                    : "Rejecting this dispute records the formal operational basis. Collections dunning can proceed according to policy."}
                </div>
              </div>

              <div className="bg-surface-elevated p-3 rounded-lg border border-surface-border text-xs space-y-1">
                <div>
                  Invoice: <strong className="font-mono text-text-primary">{resolvingDispute.invoice_id}</strong>
                </div>
                <div>
                  Category: <strong className="text-text-primary">{formatCategoryLabel(resolvingDispute.category)}</strong>
                </div>
                <div>
                  Description: <span className="text-text-secondary italic">&ldquo;{resolvingDispute.description}&rdquo;</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  {resolutionAction === "RESOLVE" ? "Resolution Notes (Required)" : "Rejection Reason (Required)"}
                </label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder={
                    resolutionAction === "RESOLVE"
                      ? "Detail the agreed adjustment or billing clarification..."
                      : "Provide operational reason why dispute is being rejected..."
                  }
                  rows={3}
                  required
                  className="w-full p-2.5 border border-surface-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                  disabled={resolveMutation.isPending || rejectMutation.isPending}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-surface-border">
                <Button
                  variant="outline"
                  onClick={() => setResolvingDispute(null)}
                  type="button"
                  disabled={resolveMutation.isPending || rejectMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={
                    resolveMutation.isPending ||
                    rejectMutation.isPending ||
                    !resolutionNotes.trim()
                  }
                  className={
                    resolutionAction === "RESOLVE"
                      ? "bg-status-success hover:bg-status-success/90 text-white"
                      : "bg-status-error hover:bg-status-error/90 text-white"
                  }
                >
                  {resolutionAction === "RESOLVE" ? (
                    <>
                      <CheckCircle2 size={14} className="mr-1.5" />
                      {resolveMutation.isPending ? "Resolving..." : "Confirm Resolution"}
                    </>
                  ) : (
                    <>
                      <XCircle size={14} className="mr-1.5" />
                      {rejectMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Open New Dispute Dialog */}
      {isCreateOpen && (
        <Dialog open={isCreateOpen} onOpenChange={(open) => !open && setIsCreateOpen(false)}>
          <DialogContent title="Open Customer Dispute">
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {createError && (
                <div className="p-3 bg-status-error/10 border border-status-error/20 text-status-error text-sm rounded-md flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg text-xs text-brand-dark flex items-start gap-2">
                <Info size={15} className="mt-0.5 shrink-0 text-brand" />
                <div>
                  <span className="font-semibold block">Dunning Pause Governance</span>
                  Opening a dispute pauses active dunning sequences on this invoice until the claim is reviewed.
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Invoice ID
                </label>
                <input
                  type="text"
                  value={newInvoiceId}
                  onChange={(e) => setNewInvoiceId(e.target.value)}
                  placeholder="e.g. inv-1"
                  required
                  className="w-full p-2 border border-surface-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand font-mono"
                  disabled={createDisputeMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Dispute Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as DisputeCategory)}
                  className="w-full p-2 border border-surface-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand bg-white"
                  disabled={createDisputeMutation.isPending}
                >
                  {CANONICAL_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Description / Evidence Summary
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe the debtor's contention, goods discrepancy, or billing claim..."
                  rows={3}
                  required
                  className="w-full p-2.5 border border-surface-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                  disabled={createDisputeMutation.isPending}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-surface-border">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  type="button"
                  disabled={createDisputeMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={createDisputeMutation.isPending || !newInvoiceId.trim() || !newDescription.trim()}
                >
                  <Plus size={14} className="mr-1.5" />
                  {createDisputeMutation.isPending ? "Opening Dispute..." : "Open Dispute"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

