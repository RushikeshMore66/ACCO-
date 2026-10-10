"use client";

import { useDemoMode } from "@/providers/DemoModeProvider";
import { Badge } from "@/components/ui/Badge";
import { Clock } from "lucide-react";
import { formatDateShort } from "@/lib/formatting/dates";

const DEMO_AUDIT = [
  { id: "e-1", type: "PAYMENT_ALLOCATED", user: "system", target: "inv-1", details: "Allocated 1500.00 INR", timestamp: new Date().toISOString() },
  { id: "e-2", type: "AI_ANALYSIS_ACCEPTED", user: "Alice Admin", target: "ana-1", details: "Payment promise of 500.00 confirmed.", timestamp: new Date(Date.now() - 3600000).toISOString() },
  { id: "e-3", type: "INVOICE_GENERATED", user: "ERP Sync", target: "inv-2", details: "Imported new invoice", timestamp: new Date(Date.now() - 86400000).toISOString() },
];

export default function AuditLogPage() {
  const { isDemoMode } = useDemoMode();

  return (
    <div className="flex flex-col h-full bg-surface p-6 overflow-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          Activity & Audit Log
          <Badge variant="warning">Demo Mode Only</Badge>
        </h1>
        <p className="text-sm text-text-secondary mt-1">Global chronological timeline of collection and system events.</p>
      </div>

      {!isDemoMode ? (
        <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden p-6 flex flex-col items-center text-center">
          <Clock size={32} className="text-text-muted mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">Audit Log Unavailable</h3>
          <p className="text-sm text-text-secondary max-w-sm">
            Live global audit endpoints are not yet implemented. Please switch to Demo Mode to view simulated audit layouts.
          </p>
        </div>
      ) : (

      <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden p-6">
        <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-surface-border before:to-transparent">
          {DEMO_AUDIT.map((event) => (
            <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-surface-border shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm">
                <Clock size={16} className="text-text-secondary" />
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-surface-border bg-white shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-bold text-sm text-text-primary">{event.type.replace(/_/g, " ")}</div>
                  <time className="text-xs text-text-muted">{formatDateShort(event.timestamp)}</time>
                </div>
                <div className="text-sm text-text-secondary mb-2">{event.details}</div>
                <div className="text-xs text-text-muted flex justify-between">
                  <span>Actor: {event.user}</span>
                  <span>Target: {event.target}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
