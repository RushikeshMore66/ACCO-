"use client";

import { useQuery } from "@tanstack/react-query";
import { receivablesApi } from "@/lib/api/receivables.api";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { BarChart3, PieChart, Activity, Download } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useDemoMode } from "@/providers/DemoModeProvider";

export default function ReportsPage() {
  const { isDemoMode } = useDemoMode();

  const { data: summary = [], isLoading: isSummaryLoading } = useQuery({
    queryKey: ["receivables-summary"],
    queryFn: () => receivablesApi.getSummary(),
  });

  const { data: aging = [], isLoading: isAgingLoading } = useQuery({
    queryKey: ["receivables-aging"],
    queryFn: () => receivablesApi.getAging(),
  });

  // Since we might have multiple currencies, let's group or just take the primary (INR) for demo.
  const mainSummary = summary.find(s => s.currency === "INR") || summary[0];
  const mainAging = aging.find(a => a.currency === "INR") || aging[0];

  const handleExport = () => {
    // Generate simple CSV
    if (!mainAging) return;
    const header = "Bucket,Amount,Invoice Count\n";
    const rows = mainAging.buckets.map(b => `${b.bucket},${b.outstanding_amount},${b.outstanding_invoices_count}`).join("\n");
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aging_report.csv';
    a.click();
  };

  return (
    <div className="flex flex-col h-full bg-surface overflow-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            Reports & Analytics
            {!isDemoMode && <Badge variant="success">Live API</Badge>}
          </h1>
          <p className="text-sm text-text-secondary mt-1">Insights into your accounts receivable and collection efforts.</p>
        </div>
        <Button onClick={handleExport} variant="outline" disabled={!mainAging}>
          <Download size={16} className="mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Receivables Summary */}
        <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-surface-border pb-4">
            <BarChart3 className="text-brand" size={20} />
            <h2 className="font-semibold text-text-primary">Receivables Summary</h2>
          </div>
          {isSummaryLoading ? (
            <div className="py-8 text-center text-sm text-text-muted">Loading...</div>
          ) : mainSummary ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Total Outstanding</span>
                <span className="font-semibold"><CurrencyDisplay amount={mainSummary.total_outstanding_amount} currency={mainSummary.currency} /></span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Overdue Amount</span>
                <span className="font-semibold text-status-error"><CurrencyDisplay amount={mainSummary.total_overdue_amount} currency={mainSummary.currency} /></span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Active Invoices</span>
                <span className="font-semibold">{mainSummary.invoices_count}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Overdue Invoices</span>
                <span className="font-semibold">{mainSummary.overdue_invoices_count}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-text-muted">No summary data available.</div>
          )}
        </div>

        {/* Receivables Aging */}
        <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-surface-border pb-4">
            <PieChart className="text-brand" size={20} />
            <h2 className="font-semibold text-text-primary">Aging Report</h2>
          </div>
          {isAgingLoading ? (
            <div className="py-8 text-center text-sm text-text-muted">Loading...</div>
          ) : mainAging ? (
            <div className="space-y-4">
              {mainAging.buckets.map(bucket => (
                <div key={bucket.bucket} className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">{bucket.bucket.replace("_", " ")}</span>
                  <span className="font-semibold"><CurrencyDisplay amount={bucket.outstanding_amount} currency={mainAging.currency} /></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-text-muted">No aging data available.</div>
          )}
        </div>
      </div>

      {/* Demo Only Reports */}
      <h2 className="text-lg font-bold text-text-primary mt-4 mb-4 flex items-center gap-2">
        Collection Performance <Badge variant="warning">Demo Only</Badge>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm opacity-80">
          <div className="flex items-center gap-2 mb-4 border-b border-surface-border pb-4">
            <Activity className="text-text-muted" size={20} />
            <h2 className="font-semibold text-text-primary">Collector Workload</h2>
          </div>
          <div className="text-sm text-text-secondary text-center py-4">
            <p>This report is not supported by the live backend yet.</p>
            {isDemoMode ? (
              <p className="mt-2 text-xs">Simulated Data: 12 Active Cases, 4 Promises to Follow Up.</p>
            ) : (
              <p className="mt-2 text-xs text-text-muted">Switch to Demo Mode to view simulated layouts.</p>
            )}
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm opacity-80">
          <div className="flex items-center gap-2 mb-4 border-b border-surface-border pb-4">
            <Activity className="text-text-muted" size={20} />
            <h2 className="font-semibold text-text-primary">Collection Effectiveness</h2>
          </div>
          <div className="text-sm text-text-secondary text-center py-4">
            <p>This report is not supported by the live backend yet.</p>
            {isDemoMode ? (
              <p className="mt-2 text-xs">Simulated Data: 68% Recovery Rate this month.</p>
            ) : (
              <p className="mt-2 text-xs text-text-muted">Switch to Demo Mode to view simulated layouts.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
