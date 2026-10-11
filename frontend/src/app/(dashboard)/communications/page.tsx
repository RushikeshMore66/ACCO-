"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { communicationsApi } from "@/lib/api/communications.api";
import { customersApi } from "@/lib/api/customers.api";
import { invoicesApi } from "@/lib/api/invoices.api";
import { isDemoMode } from "@/lib/api/client";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateShort } from "@/lib/formatting/dates";
import { formatCurrency } from "@/lib/formatting/currency";
import { CollectionMessage, MessageDirection, MessageChannel } from "@/types/collection_messages";
import { CustomerReplyAnalysis, AnalysisStatus } from "@/types/reply_analysis";
import { Customer } from "@/types/customer";
import { Invoice } from "@/types/invoice";
import { PromiseConfirmationDialog } from "./PromiseConfirmationDialog";
import Link from "next/link";
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  BrainCircuit,
  Handshake,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ExternalLink,
  FileText,
  User,
  Clock,
  Sparkles,
  Info,
  ShieldAlert,
  Send,
  Mail,
  Phone,
  MessageCircle,
  FileCheck
} from "lucide-react";

export default function CommunicationsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>("");
  const [customerFilter, setCustomerFilter] = useState<string>("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedInvoiceScope, setSelectedInvoiceScope] = useState<string>("");
  const [isPromiseDialogOpen, setIsPromiseDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Demo note composer state
  const [showDemoComposer, setShowDemoComposer] = useState(false);
  const [demoNoteBody, setDemoNoteBody] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  // Load customers for context mapping & filtering
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => customersApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Load invoices for context mapping
  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: () => invoicesApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Load messages: global in demo mode, or scoped by invoice in live mode
  const {
    data: messages = [],
    isLoading: isLoadingMessages,
    isError: isMessagesError,
    error: messagesError,
    refetch: refetchMessages
  } = useQuery<CollectionMessage[]>({
    queryKey: ["communications", isDemoMode ? "demo" : selectedInvoiceScope || "live-global"],
    queryFn: async () => {
      if (isDemoMode) {
        return communicationsApi.listAllMessages();
      }
      if (selectedInvoiceScope) {
        return communicationsApi.getMessagesByInvoice(selectedInvoiceScope);
      }
      return communicationsApi.listAllMessages();
    },
    retry: false,
  });

  // Load analyses for global list view badge resolution (in demo mode)
  const { data: allAnalyses = [] } = useQuery<CustomerReplyAnalysis[]>({
    queryKey: ["all-analyses"],
    queryFn: () => communicationsApi.listAllAnalyses(),
    enabled: isDemoMode,
    staleTime: 30 * 1000,
  });

  // Analyses for the selected message
  const {
    data: analyses = [],
    isLoading: isLoadingAnalyses,
    refetch: refetchAnalyses
  } = useQuery<CustomerReplyAnalysis[]>({
    queryKey: ["analyses", selectedMessageId],
    queryFn: () => communicationsApi.getAnalyses(selectedMessageId!),
    enabled: !!selectedMessageId,
  });

  const selectedMessage = useMemo(() => {
    return messages.find((m) => m.id === selectedMessageId) || null;
  }, [messages, selectedMessageId]);

  // Timeline events for the selected message's invoice
  const { data: timelineEvents = [] } = useQuery({
    queryKey: ["timeline", selectedMessage?.invoice_id],
    queryFn: () => communicationsApi.getTimeline(selectedMessage!.invoice_id!),
    enabled: !!selectedMessage?.invoice_id,
  });

  // Map customer details for quick lookup
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  // Map invoice details for quick lookup
  const invoiceMap = useMemo(() => {
    const map = new Map<string, Invoice>();
    invoices.forEach((inv) => map.set(inv.id, inv));
    return map;
  }, [invoices]);

  // Map analyses by source message id for quick lookup
  const messageAnalysisMap = useMemo(() => {
    const map = new Map<string, CustomerReplyAnalysis>();
    allAnalyses.forEach((a) => {
      if (!map.has(a.source_message_id)) {
        map.set(a.source_message_id, a);
      }
    });
    // Override/supplement with active analysis query
    if (selectedMessageId && analyses.length > 0) {
      map.set(selectedMessageId, analyses[0]);
    }
    return map;
  }, [allAnalyses, analyses, selectedMessageId]);

  const activeAnalysis = analyses.length > 0
    ? analyses[0]
    : selectedMessageId
    ? messageAnalysisMap.get(selectedMessageId) || null
    : null;

  // Filter messages
  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      // Search term: subject, body, customer name, invoice number
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const customer = msg.customer_id ? customerMap.get(msg.customer_id) : null;
        const invoice = msg.invoice_id ? invoiceMap.get(msg.invoice_id) : null;

        const subjectMatch = msg.subject?.toLowerCase().includes(query) ?? false;
        const bodyMatch = msg.body?.toLowerCase().includes(query) ?? false;
        const customerMatch = customer?.name.toLowerCase().includes(query) ?? false;
        const invoiceMatch = invoice?.invoice_number.toLowerCase().includes(query) ?? false;

        if (!subjectMatch && !bodyMatch && !customerMatch && !invoiceMatch) {
          return false;
        }
      }

      // Direction filter
      if (directionFilter && msg.direction !== directionFilter) {
        return false;
      }

      // Channel filter
      if (channelFilter && msg.channel !== channelFilter) {
        return false;
      }

      // Customer filter
      if (customerFilter && msg.customer_id !== customerFilter) {
        return false;
      }

      // Review status filter
      if (reviewStatusFilter) {
        const analysis = messageAnalysisMap.get(msg.id);
        if (reviewStatusFilter === "NO_ANALYSIS") {
          if (analysis) return false;
        } else {
          if (!analysis || analysis.status !== reviewStatusFilter) {
            return false;
          }
        }
      }

      return true;
    });
  }, [messages, searchTerm, directionFilter, channelFilter, customerFilter, reviewStatusFilter, customerMap, invoiceMap, messageAnalysisMap]);

  // Handle deliberate AI analysis trigger
  const handleAnalyzeMessage = async () => {
    if (!selectedMessageId || isAnalyzing) return;
    setIsAnalyzing(true);
    setActionError(null);
    try {
      await communicationsApi.analyzeMessage(selectedMessageId);
      await refetchAnalyses();
    } catch (err: any) {
      setActionError(err.message || "Failed to trigger AI reply analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle human review decision
  const handleReview = async (analysisId: string, status: "ACCEPTED" | "DISMISSED") => {
    if (isReviewing) return;
    setIsReviewing(true);
    setActionError(null);
    try {
      await communicationsApi.reviewAnalysis(analysisId, {
        status,
        notes: reviewNotes.trim() || null,
      });
      setReviewNotes("");
      await refetchAnalyses();
    } catch (err: any) {
      setActionError(err.message || "Failed to save review decision.");
    } finally {
      setIsReviewing(false);
    }
  };

  // Handle demo note submission
  const handleAddDemoNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMessage?.invoice_id || !demoNoteBody.trim() || isComposing) return;
    setIsComposing(true);
    try {
      await communicationsApi.recordInbound(selectedMessage.invoice_id, {
        direction: "INTERNAL_NOTE",
        channel: "INTERNAL",
        subject: "Internal Note (Demo)",
        body: demoNoteBody.trim(),
      });
      setDemoNoteBody("");
      setShowDemoComposer(false);
      await refetchMessages();
    } catch (err: any) {
      setActionError(err.message || "Failed to record internal note.");
    } finally {
      setIsComposing(false);
    }
  };

  const activeFilterCount = [
    directionFilter,
    channelFilter,
    reviewStatusFilter,
    customerFilter,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchTerm("");
    setDirectionFilter("");
    setChannelFilter("");
    setReviewStatusFilter("");
    setCustomerFilter("");
  };

  const getChannelIcon = (channel: MessageChannel) => {
    switch (channel) {
      case "EMAIL":
        return <Mail size={12} className="shrink-0" />;
      case "WHATSAPP":
        return <MessageCircle size={12} className="shrink-0" />;
      case "PHONE":
        return <Phone size={12} className="shrink-0" />;
      default:
        return <MessageSquare size={12} className="shrink-0" />;
    }
  };

  const getDirectionVariant = (direction: MessageDirection) => {
    switch (direction) {
      case "INBOUND":
        return "purple";
      case "OUTBOUND":
        return "default";
      case "INTERNAL_NOTE":
        return "warning";
      default:
        return "default";
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-surface">
      {/* Top Header / Mode Banner */}
      <div className="bg-white border-b border-surface-border px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
            <MessageSquare size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-text-primary">Communications Inbox</h1>
              {isDemoMode ? (
                <Badge variant="warning" dot>Demo Mode (Sample Inbox)</Badge>
              ) : (
                <Badge variant="info" dot>Live API Mode</Badge>
              )}
            </div>
            <p className="text-xs text-text-muted">
              Unified communication timeline, inbound reply intelligence, and collector promise workflows
            </p>
          </div>
        </div>

        {/* Live mode invoice scope selector if global listing is unavailable */}
        {!isDemoMode && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-secondary font-medium">Invoice Scope:</span>
            <select
              value={selectedInvoiceScope}
              onChange={(e) => {
                setSelectedInvoiceScope(e.target.value);
                setSelectedMessageId(null);
              }}
              className="h-8 px-2.5 rounded-lg border border-surface-border bg-white text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">All Invoices (Organization Scope)</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} ({formatCurrency(inv.total_amount, inv.currency)})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search messages, customers, invoices..."
        filters={[
          {
            key: "direction",
            label: "Direction",
            value: directionFilter,
            onChange: setDirectionFilter,
            options: [
              { label: "All Directions", value: "" },
              { label: "Inbound", value: "INBOUND" },
              { label: "Outbound", value: "OUTBOUND" },
              { label: "Internal Note", value: "INTERNAL_NOTE" },
            ],
          },
          {
            key: "channel",
            label: "Channel",
            value: channelFilter,
            onChange: setChannelFilter,
            options: [
              { label: "All Channels", value: "" },
              { label: "Email", value: "EMAIL" },
              { label: "WhatsApp", value: "WHATSAPP" },
              { label: "Phone", value: "PHONE" },
              { label: "Internal", value: "INTERNAL" },
            ],
          },
          {
            key: "reviewStatus",
            label: "Review Status",
            value: reviewStatusFilter,
            onChange: setReviewStatusFilter,
            options: [
              { label: "All Review Statuses", value: "" },
              { label: "Pending Review", value: "PENDING_REVIEW" },
              { label: "Accepted", value: "ACCEPTED" },
              { label: "Dismissed", value: "DISMISSED" },
              { label: "No Analysis", value: "NO_ANALYSIS" },
            ],
          },
          {
            key: "customer",
            label: "Customer",
            value: customerFilter,
            onChange: setCustomerFilter,
            options: [
              { label: "All Customers", value: "" },
              ...customers.map((c) => ({ label: c.name, value: c.id })),
            ],
          },
        ]}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearAllFilters}
        actions={
          <span className="text-xs text-text-muted font-medium">
            {filteredMessages.length} {filteredMessages.length === 1 ? "conversation" : "conversations"}
          </span>
        }
      />

      {/* Main Split-Pane Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: Conversation List (Visible on desktop; on mobile hidden if message selected) */}
        <div
          className={`w-full md:w-[380px] lg:w-[420px] border-r border-surface-border bg-white flex flex-col shrink-0 overflow-hidden ${
            selectedMessageId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="flex-1 overflow-y-auto divide-y divide-surface-border" role="feed" aria-label="Conversation list">
            {isLoadingMessages ? (
              <div className="p-8 text-center text-sm text-text-muted space-y-2">
                <div className="inline-block animate-spin w-5 h-5 border-2 border-brand border-t-transparent rounded-full" />
                <p>Loading conversation inbox...</p>
              </div>
            ) : isMessagesError ? (
              <div className="p-6">
                <EmptyState
                  icon={ShieldAlert}
                  title="Global Inbox Unavailable"
                  description={
                    isDemoMode
                      ? "Unable to load conversations. Please retry."
                      : "The current backend does not expose an organization-wide message list endpoint. Messages are scoped per invoice (/collections/invoices/{id}/messages). Please select a specific invoice from the scope selector above, or use Demo Mode."
                  }
                />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={MessageSquare}
                  title="No conversations found"
                  description={
                    messages.length === 0
                      ? "There are no collection communications recorded yet."
                      : "No messages match your active search or filter criteria."
                  }
                  action={
                    activeFilterCount > 0
                      ? { label: "Clear Filters", onClick: clearAllFilters }
                      : undefined
                  }
                />
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const customer = msg.customer_id ? customerMap.get(msg.customer_id) : null;
                const invoice = msg.invoice_id ? invoiceMap.get(msg.invoice_id) : null;
                const analysis = messageAnalysisMap.get(msg.id);
                const isSelected = selectedMessageId === msg.id;

                return (
                  <div
                    key={msg.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedMessageId(msg.id);
                      setActionError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedMessageId(msg.id);
                        setActionError(null);
                      }
                    }}
                    className={`p-4 cursor-pointer text-left transition-colors focus:outline-none focus:bg-surface-elevated ${
                      isSelected
                        ? "bg-brand/5 border-l-4 border-brand"
                        : "hover:bg-surface/60 border-l-4 border-transparent"
                    }`}
                  >
                    {/* Top Row: Customer / Company + Timestamp */}
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className="text-xs font-semibold text-text-primary truncate">
                        {customer ? customer.name : msg.customer_id ? `Customer ${msg.customer_id.substring(0, 8)}` : "Unknown Customer"}
                      </span>
                      <span className="text-[11px] text-text-muted shrink-0 flex items-center gap-1">
                        <Clock size={11} />
                        {formatDateShort(msg.created_at)}
                      </span>
                    </div>

                    {/* Subject line */}
                    <h3 className="text-sm font-medium text-text-primary truncate mb-1">
                      {msg.subject || "(No Subject)"}
                    </h3>

                    {/* Preview snippet */}
                    <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed mb-2.5">
                      {msg.body}
                    </p>

                    {/* Badges Row */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={getDirectionVariant(msg.direction)}>
                        {msg.direction.replace("_", " ")}
                      </Badge>

                      <Badge variant="default" className="flex items-center gap-1">
                        {getChannelIcon(msg.channel)}
                        <span>{msg.channel}</span>
                      </Badge>

                      {invoice && (
                        <span className="inline-flex items-center text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-surface border border-surface-border text-text-secondary">
                          {invoice.invoice_number}
                        </span>
                      )}

                      {/* Review status badge if analysis exists */}
                      {analysis && (
                        <Badge
                          variant={
                            analysis.status === "ACCEPTED"
                              ? "success"
                              : analysis.status === "PENDING_REVIEW"
                              ? "warning"
                              : "muted"
                          }
                          dot
                        >
                          {analysis.status === "PENDING_REVIEW" ? "Review Pending" : analysis.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Conversation Details & AI Reply Review */}
        <div
          className={`flex-1 bg-surface flex flex-col overflow-y-auto ${
            selectedMessageId ? "flex" : "hidden md:flex"
          }`}
        >
          {selectedMessage ? (
            <div className="p-6 max-w-4xl w-full mx-auto space-y-6">
              {/* Mobile Back Button */}
              <div className="md:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<ArrowLeft size={14} />}
                  onClick={() => setSelectedMessageId(null)}
                >
                  Back to Inbox
                </Button>
              </div>

              {/* Action Error Banner */}
              {actionError && (
                <div className="p-3 bg-status-error/10 border border-status-error/20 text-status-error text-sm rounded-lg flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Conversation Header Card */}
              <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm space-y-4">
                <div className="flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">
                      {selectedMessage.subject || "(No Subject)"}
                    </h2>
                    <div className="text-xs text-text-muted mt-1 flex items-center gap-3">
                      <span>Created: {formatDateShort(selectedMessage.created_at)}</span>
                      {selectedMessage.sent_at && (
                        <span>Sent: {formatDateShort(selectedMessage.sent_at)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getDirectionVariant(selectedMessage.direction)}>
                      {selectedMessage.direction.replace("_", " ")}
                    </Badge>
                    <Badge variant="default" className="flex items-center gap-1">
                      {getChannelIcon(selectedMessage.channel)}
                      <span>{selectedMessage.channel}</span>
                    </Badge>
                    <Badge variant="muted">{selectedMessage.status}</Badge>
                  </div>
                </div>

                {/* Canonical Links: Customer & Invoice Context */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-surface-border text-sm">
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-brand shrink-0" />
                    <span className="text-text-secondary text-xs">Customer:</span>
                    {selectedMessage.customer_id ? (
                      <Link
                        href={`/customers/${selectedMessage.customer_id}`}
                        className="font-medium text-brand hover:underline inline-flex items-center gap-1"
                      >
                        {customerMap.get(selectedMessage.customer_id)?.name || selectedMessage.customer_id}
                        <ExternalLink size={12} />
                      </Link>
                    ) : (
                      <span className="text-text-muted">Unassigned</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-brand shrink-0" />
                    <span className="text-text-secondary text-xs">Associated Invoice:</span>
                    {selectedMessage.invoice_id ? (
                      <Link
                        href={`/invoices/${selectedMessage.invoice_id}`}
                        className="font-mono font-medium text-brand hover:underline inline-flex items-center gap-1"
                      >
                        {invoiceMap.get(selectedMessage.invoice_id)?.invoice_number || selectedMessage.invoice_id}
                        <ExternalLink size={12} />
                      </Link>
                    ) : (
                      <span className="text-text-muted font-mono">None</span>
                    )}
                  </div>
                </div>

                {/* Message Body Content */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Message Body
                  </label>
                  <div className="text-sm text-text-primary whitespace-pre-wrap bg-surface p-4 rounded-lg border border-surface-border leading-relaxed font-sans">
                    {selectedMessage.body}
                  </div>
                </div>
              </div>

              {/* AI Reply Intelligence Panel */}
              {selectedMessage.direction === "INBOUND" && (
                <div className="bg-white rounded-xl border border-brand/30 p-6 shadow-sm space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-brand">
                      <BrainCircuit size={20} />
                      <h3 className="font-bold text-sm tracking-wide">
                        AI Reply Intelligence
                      </h3>
                    </div>
                    {activeAnalysis ? (
                      <Badge
                        variant={
                          activeAnalysis.status === "ACCEPTED"
                            ? "success"
                            : activeAnalysis.status === "PENDING_REVIEW"
                            ? "warning"
                            : "muted"
                        }
                        dot
                      >
                        {activeAnalysis.status === "PENDING_REVIEW"
                          ? "Pending Collector Review"
                          : `Status: ${activeAnalysis.status}`}
                      </Badge>
                    ) : (
                      <Badge variant="purple">Inbound Extraction Ready</Badge>
                    )}
                  </div>

                  {/* Explicit Financial Notice */}
                  <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg text-xs text-brand-dark flex items-start gap-2">
                    <Info size={15} className="mt-0.5 shrink-0 text-brand" />
                    <div>
                      <span className="font-semibold block">Advisory AI Extraction Notice</span>
                      AI reply classifications and proposed amounts are advisory extractions. They do not automatically modify canonical invoices, adjust balances, or record payment promises without explicit collector confirmation.
                    </div>
                  </div>

                  {/* When analysis is loading, or exists, or prompt deliberate analysis */}
                  {isLoadingAnalyses ? (
                    <div className="p-8 text-center text-xs text-text-muted">
                      <div className="inline-block animate-spin w-4 h-4 border-2 border-brand border-t-transparent rounded-full mb-2" />
                      <p>Loading AI reply intelligence...</p>
                    </div>
                  ) : activeAnalysis ? (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-surface p-4 rounded-lg border border-surface-border text-sm">
                        <div>
                          <span className="block text-xs font-medium text-text-muted mb-1">
                            Primary Classification
                          </span>
                          <Badge variant="info">
                            {activeAnalysis.classification.replace(/_/g, " ")}
                          </Badge>
                          {activeAnalysis.analysis_payload.secondary_classifications?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {activeAnalysis.analysis_payload.secondary_classifications.map((sec) => (
                                <Badge key={sec} variant="default" className="text-[10px]">
                                  {sec.replace(/_/g, " ")}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <span className="block text-xs font-medium text-text-muted mb-1">
                            Extraction Confidence
                          </span>
                          <span className="font-semibold text-text-primary">
                            {Math.round(activeAnalysis.confidence_score * 100)}%
                          </span>
                        </div>

                        {activeAnalysis.analysis_payload.customer_intent && (
                          <div className="md:col-span-2">
                            <span className="block text-xs font-medium text-text-muted mb-1">
                              Customer Intent
                            </span>
                            <p className="text-text-primary font-medium">
                              {activeAnalysis.analysis_payload.customer_intent}
                            </p>
                          </div>
                        )}

                        {activeAnalysis.analysis_payload.evidence_summary && (
                          <div className="md:col-span-2">
                            <span className="block text-xs font-medium text-text-muted mb-1">
                              Evidence Summary
                            </span>
                            <p className="text-text-secondary text-xs leading-relaxed">
                              {activeAnalysis.analysis_payload.evidence_summary}
                            </p>
                          </div>
                        )}

                        {activeAnalysis.analysis_payload.explicit_payment_amount != null && (
                          <div>
                            <span className="block text-xs font-medium text-text-muted mb-1">
                              Proposed Amount
                            </span>
                            <span className="font-bold text-brand text-base">
                              {formatCurrency(
                                Number(activeAnalysis.analysis_payload.explicit_payment_amount),
                                activeAnalysis.analysis_payload.currency || "INR"
                              )}
                            </span>
                          </div>
                        )}

                        {activeAnalysis.analysis_payload.proposed_payment_date && (
                          <div>
                            <span className="block text-xs font-medium text-text-muted mb-1">
                              Proposed Date Phrasing
                            </span>
                            <span className="font-medium text-text-primary italic">
                              &ldquo;{activeAnalysis.analysis_payload.proposed_payment_date}&rdquo;
                            </span>
                          </div>
                        )}

                        {activeAnalysis.analysis_payload.claims_already_paid && (
                          <div className="md:col-span-2 p-2.5 bg-status-warning/10 border border-status-warning/30 rounded text-xs text-status-warning font-medium">
                            Warning: Customer claims payment has already been remitted. Verify bank allocations before following up.
                          </div>
                        )}

                        {activeAnalysis.analysis_payload.dispute_category && (
                          <div>
                            <span className="block text-xs font-medium text-text-muted mb-1">
                              Dispute Category
                            </span>
                            <Badge variant="error">{activeAnalysis.analysis_payload.dispute_category}</Badge>
                          </div>
                        )}

                        {activeAnalysis.analysis_payload.missing_information && (
                          <div>
                            <span className="block text-xs font-medium text-text-muted mb-1">
                              Missing Information
                            </span>
                            <p className="text-xs text-text-secondary">
                              {activeAnalysis.analysis_payload.missing_information}
                            </p>
                          </div>
                        )}

                        {activeAnalysis.analysis_payload.recommended_next_action && (
                          <div className="md:col-span-2 pt-2 border-t border-surface-border">
                            <span className="block text-xs font-medium text-text-muted mb-1">
                              Recommended Collector Action
                            </span>
                            <p className="text-sm font-semibold text-text-primary">
                              {activeAnalysis.analysis_payload.recommended_next_action}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Human Review Controls */}
                      {activeAnalysis.status === "PENDING_REVIEW" ? (
                        <div className="pt-2 border-t border-surface-border space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">
                              Collector Review Notes (Optional)
                            </label>
                            <input
                              type="text"
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              placeholder="Add review or escalation comments..."
                              className="w-full p-2 border border-surface-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                              disabled={isReviewing}
                            />
                          </div>

                          <div className="flex flex-wrap justify-end gap-3">
                            <Button
                              variant="outline"
                              onClick={() => handleReview(activeAnalysis.id, "DISMISSED")}
                              disabled={isReviewing}
                            >
                              <XCircle size={15} className="mr-1.5" />
                              Dismiss Analysis
                            </Button>
                            <Button
                              variant="primary"
                              onClick={() => handleReview(activeAnalysis.id, "ACCEPTED")}
                              disabled={isReviewing}
                            >
                              <CheckCircle size={15} className="mr-1.5" />
                              {isReviewing ? "Saving..." : "Accept Analysis"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-3 border-t border-surface-border flex flex-wrap justify-between items-center gap-3">
                          <div className="text-xs text-text-secondary space-y-0.5">
                            <div>
                              Decision: <strong className="text-text-primary">{activeAnalysis.status}</strong>
                              {activeAnalysis.reviewed_at && (
                                <span className="ml-2 text-text-muted">
                                  on {formatDateShort(activeAnalysis.reviewed_at)}
                                </span>
                              )}
                            </div>
                            {activeAnalysis.review_notes && (
                              <div className="text-text-muted italic">
                                Notes: &ldquo;{activeAnalysis.review_notes}&rdquo;
                              </div>
                            )}
                          </div>

                          {/* Hand-off to Promise Confirmation */}
                          {activeAnalysis.status === "ACCEPTED" &&
                            (activeAnalysis.classification === "PAYMENT_PROMISE" ||
                              activeAnalysis.analysis_payload.explicit_payment_amount != null) && (
                              <Button
                                variant="primary"
                                onClick={() => setIsPromiseDialogOpen(true)}
                              >
                                <Handshake size={15} className="mr-1.5" />
                                Record Payment Promise
                              </Button>
                            )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* When NO analysis exists yet: Deliberate Analyze Action */
                    <div className="p-4 bg-surface rounded-lg border border-dashed border-brand/40 text-center space-y-3">
                      <p className="text-xs text-text-secondary">
                        No AI intelligence has been run for this inbound message yet. AI analysis must be deliberately initiated by the collector.
                      </p>
                      <Button
                        variant="primary"
                        onClick={handleAnalyzeMessage}
                        disabled={isAnalyzing}
                      >
                        <Sparkles size={15} className="mr-1.5" />
                        {isAnalyzing ? "Analyzing Message..." : "Run AI Reply Analysis"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Related Activity Timeline (when associated with an invoice) */}
              {selectedMessage.invoice_id && timelineEvents.length > 0 && (
                <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-text-primary">
                    <FileCheck size={18} className="text-brand" />
                    <h3 className="font-bold text-sm">Associated Invoice Activity Timeline</h3>
                  </div>

                  <div className="divide-y divide-surface-border text-xs">
                    {timelineEvents.slice(0, 5).map((evt, idx) => (
                      <div key={evt.id || idx} className="py-2.5 flex justify-between items-start gap-3">
                        <div>
                          <span className="font-medium text-text-primary block">{evt.description}</span>
                          <span className="text-[11px] text-text-muted uppercase tracking-wider">{evt.event_type}</span>
                        </div>
                        {evt.created_at && (
                          <span className="text-[11px] text-text-muted shrink-0">
                            {formatDateShort(evt.created_at)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Demo Composer / Internal Note (explicitly labeled demo mode) */}
              {isDemoMode && selectedMessage.invoice_id && (
                <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-text-primary">
                      <Send size={16} className="text-brand" />
                      <h3 className="font-bold text-sm">Record Internal Note (Demo Mode)</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowDemoComposer(!showDemoComposer)}
                    >
                      {showDemoComposer ? "Cancel" : "Add Note"}
                    </Button>
                  </div>

                  <p className="text-xs text-text-muted">
                    Outbound sending via live email or WhatsApp is disabled to prevent external delivery. You can log internal collection notes in demo mode.
                  </p>

                  {showDemoComposer && (
                    <form onSubmit={handleAddDemoNote} className="space-y-3 pt-2">
                      <textarea
                        value={demoNoteBody}
                        onChange={(e) => setDemoNoteBody(e.target.value)}
                        placeholder="Log customer contact notes or call summaries..."
                        rows={3}
                        required
                        className="w-full p-2.5 border border-surface-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          type="submit"
                          disabled={isComposing || !demoNoteBody.trim()}
                        >
                          {isComposing ? "Saving..." : "Save Internal Note"}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Empty State when no conversation is selected */
            <div className="h-full flex items-center justify-center p-8">
              <EmptyState
                icon={MessageSquare}
                title="Select a conversation"
                description="Choose a conversation from the list to view message history, canonical invoice links, and AI reply intelligence."
              />
            </div>
          )}
        </div>
      </div>

      {/* Payment Promise Confirmation Dialog */}
      {activeAnalysis && selectedMessage && selectedMessage.invoice_id && (
        <PromiseConfirmationDialog
          isOpen={isPromiseDialogOpen}
          onClose={() => setIsPromiseDialogOpen(false)}
          analysis={activeAnalysis}
          invoiceId={selectedMessage.invoice_id}
        />
      )}
    </div>
  );
}
