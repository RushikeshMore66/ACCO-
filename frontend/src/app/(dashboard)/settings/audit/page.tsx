"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDemoMode } from "@/providers/DemoModeProvider";
import { settingsApi } from "@/lib/api/settings.api";
import { AuditEvent } from "@/types/collections";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDateShort, formatDateTime } from "@/lib/formatting/dates";
import {
  Clock,
  Layers,
  Search,
  Filter,
  RefreshCw,
  Info,
  ShieldAlert,
  CreditCard,
  MessageSquare,
  FileText,
  Building2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

export default function AuditLogPage() {
  const { isDemoMode } = useDemoMode();

  const [searchTerm, setSearchTerm] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("ALL");

  const {
    data: events = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["auditEvents", { isDemoMode, eventTypeFilter }],
    queryFn: () =>
      settingsApi.listAuditEvents(
        { event_type: eventTypeFilter },
        isDemoMode
      ),
    enabled: isDemoMode, // Only query in demo mode; live global audit endpoint is not supported
  });

  const filteredEvents = useMemo(() => {
    let result = [...events];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.actor.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.target && e.target.toLowerCase().includes(q))
      );
    }
    return result;
  }, [events, searchTerm]);

  const getEventBadge = (type: string) => {
    if (type.includes("PAYMENT")) {
      return <Badge variant="success">Payment Event</Badge>;
    }
    if (type.includes("DISPUTE")) {
      return <Badge variant="error">Dispute Protocol</Badge>;
    }
    if (type.includes("POLICY")) {
      return <Badge variant="purple">Governance Policy</Badge>;
    }
    if (type.includes("PROMISE")) {
      return <Badge variant="info">Promise Commitment</Badge>;
    }
    return <Badge variant="default">{type.replace(/_/g, " ")}</Badge>;
  };

  return (
    <div className="flex flex-col h-full bg-surface p-6 overflow-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              Activity & Audit History
            </h1>
            {isDemoMode ? (
              <Badge variant="warning" className="gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-status-warning shrink-0" />
                Demo Mode Only
              </Badge>
            ) : (
              <Badge variant="purple" className="gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                Live Organization
              </Badge>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Chronological record of collection actions, dispute resolutions, and policy revisions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/invoices">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <FileText size={14} />
              <span>Invoice Timelines</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Demo Notice Banner */}
      {isDemoMode && (
        <div className="p-4 bg-status-warning-bg/40 border border-status-warning/30 rounded-xl flex items-start gap-3">
          <Info size={18} className="text-status-warning shrink-0 mt-0.5" />
          <div className="text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold text-text-primary">Simulated Activity Log: </span>
            The timeline entries below represent simulated demo events illustrating cross-functional dunning workflows.
            Live organization-wide event streams are maintained at the per-invoice level on the backend.
          </div>
        </div>
      )}

      {/* Live Mode Unavailable Notice */}
      {!isDemoMode ? (
        <div className="bg-white rounded-xl border border-surface-border shadow-sm p-8 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-surface border border-surface-border flex items-center justify-center text-text-muted mb-4">
            <Clock size={24} />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Global Audit Log Unavailable in Live Mode
          </h3>
          <p className="text-sm text-text-secondary max-w-lg leading-relaxed mb-4">
            The FastAPI backend currently maintains chronological collection history strictly on a per-invoice basis
            (<code className="font-mono text-2xs bg-surface px-1.5 py-0.5 rounded">/api/v1/collections/invoices/{`{id}`}/timeline</code>).
            A global organization-wide audit stream is awaiting the analytics milestone.
          </p>
          <div className="p-4 bg-surface border border-surface-border rounded-lg max-w-lg w-full text-left text-xs space-y-2 text-text-secondary mb-5">
            <div className="font-semibold text-text-primary">Where to view live activity:</div>
            <p>
              • Open any individual invoice in the <Link href="/invoices" className="text-brand font-medium hover:underline">Invoice Directory</Link> to inspect its verified timeline of collection messages, payments, and policy events.
            </p>
            <p>
              • Switch to <strong>Demo Mode</strong> to preview global multi-entity timeline styling and event filtering.
            </p>
          </div>
        </div>
      ) : (
        /* Demo Mode Activity History Workspace */
        <div className="bg-white rounded-xl border border-surface-border shadow-sm overflow-hidden flex flex-col">
          {/* Filter Bar */}
          <div className="p-4 border-b border-surface-border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search events by actor, description, or target…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-surface-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand"
                aria-label="Search audit events"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter size={14} className="text-text-muted" />
              <select
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                className="h-9 px-2.5 rounded-lg border border-surface-border bg-white text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-brand"
                aria-label="Filter by event type"
              >
                <option value="ALL">All Event Types</option>
                <option value="PAYMENT_ALLOCATED">Payment Allocated</option>
                <option value="PROMISE_CREATED">Promise Created</option>
                <option value="POLICY_UPDATED">Policy Updated</option>
                <option value="OUTREACH_APPROVED">Outreach Approved</option>
                <option value="DISPUTE_OPENED">Dispute Opened</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                isLoading={isFetching}
                title="Refresh audit timeline"
                className="h-9 px-2.5"
              >
                <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
              </Button>
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredEvents.length === 0 && (
            <div className="p-8">
              <EmptyState
                icon={Clock}
                title="No activity events found"
                description={
                  searchTerm || eventTypeFilter !== "ALL"
                    ? "No events matched your current filters. Try resetting your search."
                    : "No events recorded in the timeline."
                }
                action={
                  searchTerm || eventTypeFilter !== "ALL"
                    ? {
                        label: "Clear Filters",
                        onClick: () => {
                          setSearchTerm("");
                          setEventTypeFilter("ALL");
                        },
                      }
                    : undefined
                }
              />
            </div>
          )}

          {/* Timeline View */}
          {!isLoading && filteredEvents.length > 0 && (
            <div className="p-6">
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-surface-border">
                {filteredEvents.map((event) => (
                  <div key={event.id} className="relative">
                    {/* Timeline Node */}
                    <div className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-brand ring-4 ring-white" />

                    <div className="p-4 rounded-xl border border-surface-border bg-surface/30 hover:bg-surface/60 transition-colors space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-2">
                          {getEventBadge(event.event_type)}
                          <span className="text-xs font-semibold text-text-primary">
                            {event.event_type.replace(/_/g, " ")}
                          </span>
                        </div>
                        <time className="text-2xs text-text-muted">
                          {formatDateTime(event.created_at)}
                        </time>
                      </div>

                      <p className="text-xs text-text-secondary leading-relaxed">
                        {event.description}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-surface-border/60 text-2xs text-text-muted">
                        <div>
                          <span>Actor: </span>
                          <span className="font-medium text-text-primary">{event.actor}</span>
                        </div>
                        {event.target && (
                          <div className="flex items-center gap-1">
                            <span>Target: </span>
                            <span className="font-mono font-medium text-text-primary">
                              {event.target}
                            </span>
                            {event.target_id && (
                              <Link
                                href={`/invoices/${event.target_id}`}
                                className="text-brand hover:underline inline-flex items-center ml-1"
                              >
                                <span>view</span>
                                <ExternalLink size={10} className="ml-0.5" />
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
