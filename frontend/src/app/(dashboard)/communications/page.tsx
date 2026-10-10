"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { communicationsApi } from "@/lib/api/communications.api";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageSquare, CheckCircle, XCircle, BrainCircuit, Handshake } from "lucide-react";
import { formatDateShort } from "@/lib/formatting/dates";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PromiseConfirmationDialog } from "./PromiseConfirmationDialog";

export default function CommunicationsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isPromiseDialogOpen, setIsPromiseDialogOpen] = useState(false);

  const { data: messages = [], isLoading, isError } = useQuery({
    queryKey: ["communications"],
    queryFn: () => communicationsApi.listAllMessages(),
    retry: false,
  });

  const { data: analyses = [], refetch: refetchAnalyses } = useQuery({
    queryKey: ["analyses", selectedMessageId],
    queryFn: () => communicationsApi.getAnalyses(selectedMessageId!),
    enabled: !!selectedMessageId,
  });

  const handleReview = async (analysisId: string, status: "ACCEPTED" | "DISMISSED") => {
    try {
      await communicationsApi.reviewAnalysis(analysisId, { status, notes: "" });
      refetchAnalyses();
    } catch (e) {
      console.error(e);
      alert("Failed to review analysis.");
    }
  };

  const filtered = messages.filter(m => 
    m.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.body.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedMessage = messages.find(m => m.id === selectedMessageId);
  const activeAnalysis = analyses[0];

  return (
    <div className="flex flex-col h-full bg-surface">
      <FilterBar 
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search messages..."
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Inbox List */}
        <div className="w-1/3 border-r border-surface-border bg-white overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-text-muted">Loading inbox...</div>
          ) : isError ? (
            <div className="p-8">
              <EmptyState 
                icon={MessageSquare} 
                title="Global Inbox Unavailable" 
                description="Global message listing is currently available in Demo Mode only. Please view messages on individual invoices." 
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={MessageSquare} title="No matches found" description="Adjust your search filters to see more messages." />
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {filtered.map(msg => (
                <div 
                  key={msg.id}
                  onClick={() => setSelectedMessageId(msg.id)}
                  className={`p-4 cursor-pointer hover:bg-surface/50 transition-colors ${selectedMessageId === msg.id ? 'bg-surface border-l-2 border-brand' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-medium text-text-secondary">{msg.channel} • {msg.direction}</span>
                    <span className="text-xs text-text-muted">{formatDateShort(msg.created_at)}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-text-primary truncate">{msg.subject || "No Subject"}</h3>
                  <p className="text-sm text-text-secondary truncate mt-1">{msg.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Message Detail & AI Analysis */}
        <div className="flex-1 bg-surface flex flex-col">
          {selectedMessage ? (
            <div className="p-6 overflow-y-auto h-full space-y-6">
              <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">{selectedMessage.subject || "No Subject"}</h2>
                    <div className="text-sm text-text-secondary mt-1">
                      Related Invoice: <Link href={`/invoices/${selectedMessage.invoice_id}`} className="text-brand hover:underline">{selectedMessage.invoice_id}</Link>
                    </div>
                  </div>
                  <Badge variant="muted">{selectedMessage.status}</Badge>
                </div>
                <div className="text-sm text-text-primary whitespace-pre-wrap bg-surface p-4 rounded-md border border-surface-border">
                  {selectedMessage.body}
                </div>
              </div>

              {selectedMessage.direction === "INBOUND" && activeAnalysis && (
                <div className="bg-white rounded-xl border border-brand/20 p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 text-brand">
                    <BrainCircuit size={18} />
                    <h3 className="font-bold text-sm uppercase tracking-wide">AI Reply Analysis</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <span className="block text-xs text-text-secondary mb-1">Classification</span>
                      <Badge variant="info">{activeAnalysis.classification.replace("_", " ")}</Badge>
                    </div>
                    <div>
                      <span className="block text-xs text-text-secondary mb-1">Confidence</span>
                      <span className="text-sm font-medium">{Math.round(activeAnalysis.confidence_score * 100)}%</span>
                    </div>
                    {activeAnalysis.analysis_payload.explicit_payment_amount && (
                      <div>
                        <span className="block text-xs text-text-secondary mb-1">Extracted Amount</span>
                        <span className="text-sm font-medium text-text-primary">{activeAnalysis.analysis_payload.explicit_payment_amount} {activeAnalysis.analysis_payload.currency}</span>
                      </div>
                    )}
                    {activeAnalysis.analysis_payload.proposed_payment_date && (
                      <div>
                        <span className="block text-xs text-text-secondary mb-1">Proposed Date</span>
                        <span className="text-sm font-medium text-text-primary">{formatDateShort(activeAnalysis.analysis_payload.proposed_payment_date)}</span>
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="block text-xs text-text-secondary mb-1">Reasoning</span>
                      <p className="text-sm text-text-primary">{activeAnalysis.analysis_payload.evidence_summary}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-xs text-text-secondary mb-1">Suggested Action</span>
                      <p className="text-sm text-text-primary font-medium">{activeAnalysis.analysis_payload.recommended_next_action}</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-surface-border">
                    {activeAnalysis.status === "PENDING_REVIEW" ? (
                      <>
                        <Button variant="outline" onClick={() => handleReview(activeAnalysis.id, "DISMISSED")}>
                          <XCircle size={16} className="mr-2" />
                          Dismiss
                        </Button>
                        <Button variant="primary" onClick={() => handleReview(activeAnalysis.id, "ACCEPTED")}>
                          <CheckCircle size={16} className="mr-2" />
                          Accept Analysis
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center text-sm font-medium text-text-secondary gap-3">
                        <span>Status: <Badge variant={activeAnalysis.status === 'ACCEPTED' ? 'success' : 'muted'} className="ml-2">{activeAnalysis.status}</Badge></span>
                        {activeAnalysis.status === "ACCEPTED" && activeAnalysis.classification === "PAYMENT_PROMISE" && (
                          <button onClick={() => setIsPromiseDialogOpen(true)} className="px-3 py-1.5 bg-brand text-white rounded-md hover:bg-brand-dark transition-colors flex items-center gap-2">
                            <Handshake size={14} /> Create Promise Record
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <EmptyState icon={MessageSquare} title="Select a message" description="Choose a message from the list to view details and AI analysis." />
            </div>
          )}
        </div>
      </div>
      
      {activeAnalysis && selectedMessage && (
        <PromiseConfirmationDialog 
          isOpen={isPromiseDialogOpen} 
          onClose={() => setIsPromiseDialogOpen(false)} 
          analysis={activeAnalysis}
          invoiceId={selectedMessage.invoice_id!}
        />
      )}
    </div>
  );
}
