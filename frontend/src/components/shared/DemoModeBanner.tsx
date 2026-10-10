"use client";

import { AlertTriangle, X } from "lucide-react";
import { useDemoMode } from "@/providers/DemoModeProvider";
import { useState } from "react";

/**
 * DemoModeBanner — visible indicator that the application is running
 * with demo/mock data and not a live backend.
 *
 * Financial decisions must never be made based on demo data.
 */
export function DemoModeBanner() {
  const { isDemoMode } = useDemoMode();
  const [dismissed, setDismissed] = useState(false);

  if (!isDemoMode || dismissed) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center gap-3 px-4 py-2 bg-status-warning-bg border-b border-status-warning/30 text-status-warning text-xs"
    >
      <AlertTriangle size={13} aria-hidden className="shrink-0" />
      <p className="flex-1">
        <strong>Demo Mode</strong> — This application is displaying sample
        data. No real invoices, payments, or financial records are shown. Do
        not use this data for financial decisions.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-0.5 rounded hover:bg-status-warning/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-warning"
        aria-label="Dismiss demo mode banner"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
