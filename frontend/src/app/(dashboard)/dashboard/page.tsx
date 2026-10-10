"use client";

import { useQuery } from "@tanstack/react-query";
import { receivablesApi } from "@/lib/api/receivables.api";
import { collectionsApi } from "@/lib/api/collections.api";
import { communicationsApi } from "@/lib/api/communications.api";
import { isDemoMode } from "@/lib/api/client";
import { KpiCard } from "@/components/shared/KpiCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { AlertTriangle, Clock, Target, IndianRupee, PieChart, FileText, CheckCircle2, MessageSquare } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Cell } from "recharts";
import Link from "next/link";
import { InvoiceBalanceResponse } from "@/types/receivables";

// Helper for formatting currency
const formatCurrency = (amount: number, currency = "INR") => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function DashboardPage() {
  const { data: summaries, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["receivables-summary"],
    queryFn: () => receivablesApi.getSummary(),
  });

  const { data: aging, isLoading: isAgingLoading } = useQuery({
    queryKey: ["receivables-aging"],
    queryFn: () => receivablesApi.getAging(),
  });

  const { data: invoices, isLoading: isInvoicesLoading } = useQuery({
    queryKey: ["receivables-invoices-recent"],
    queryFn: () => receivablesApi.getInvoices({ limit: 100 }),
  });

  const { data: promises } = useQuery({
    queryKey: ["collections-promises"],
    queryFn: () => collectionsApi.listAllPromises(),
    enabled: isDemoMode,
  });

  const { data: analyses } = useQuery({
    queryKey: ["communications-analyses"],
    queryFn: () => communicationsApi.listAllAnalyses(),
    enabled: isDemoMode,
  });

  // Default to first currency summary (INR in demo)
  const summary = summaries?.[0];
  const agingReport = aging?.[0];

  const isLoading = isSummaryLoading || isAgingLoading || isInvoicesLoading;

  const bucketLabels = {
    "NOT_DUE": "Current",
    "1_30": "1-30 Days",
    "31_60": "31-60 Days",
    "61_90": "61-90 Days",
    "90_PLUS": "90+ Days"
  };

  const chartData = agingReport?.buckets.map(b => ({
    name: bucketLabels[b.bucket],
    amount: Number(b.outstanding_amount),
    isOverdue: b.bucket !== "NOT_DUE"
  })) || [];

  // Build the priority queue items
  type WorkItem = {
    id: string;
    type: "invoice" | "promise" | "analysis";
    title: string;
    subtitle: string;
    amount?: number | string;
    currency?: string;
    priority: "high" | "medium" | "low";
    link: string;
  };

  const workItems: WorkItem[] = [];

  if (invoices) {
    const overdueInvoices = invoices.filter(i => i.days_overdue > 0 && i.payment_status !== "PAID");
    overdueInvoices.sort((a, b) => b.days_overdue - a.days_overdue);
    overdueInvoices.slice(0, 5).forEach(inv => {
      workItems.push({
        id: `inv-${inv.invoice_id}`,
        type: "invoice",
        title: `Invoice ${inv.invoice_number}`,
        subtitle: `${inv.days_overdue} days overdue`,
        amount: inv.outstanding_amount,
        currency: inv.currency,
        priority: inv.days_overdue > 60 ? "high" : "medium",
        link: `/invoices/${inv.invoice_id}`
      });
    });
  }

  if (promises && isDemoMode) {
    const pendingPromises = promises.filter(p => p.status === "ACTIVE" || p.status === "MISSED");
    pendingPromises.forEach(p => {
      workItems.push({
        id: `prom-${p.id}`,
        type: "promise",
        title: p.status === "MISSED" ? "Missed Promise" : "Upcoming Promise",
        subtitle: `Expected on ${new Date(p.expected_payment_date).toLocaleDateString()}`,
        amount: p.promised_amount,
        currency: p.currency,
        priority: p.status === "MISSED" ? "high" : "medium",
        link: `/invoices/${p.invoice_id}`
      });
    });
  }

  if (analyses && isDemoMode) {
    const pendingAnalyses = analyses.filter(a => a.status === "PENDING_REVIEW");
    pendingAnalyses.forEach(a => {
      workItems.push({
        id: `anal-${a.id}`,
        type: "analysis",
        title: "Reply Needs Review",
        subtitle: `Suggested intent: ${a.analysis_payload.customer_intent}`,
        priority: "medium",
        link: `/communications`
      });
    });
  }

  // Sort work items: high priority first
  workItems.sort((a, b) => {
    const pScore = { high: 3, medium: 2, low: 1 };
    return pScore[b.priority] - pScore[a.priority];
  });
  
  const displayItems = workItems.slice(0, 6);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Overview</h1>
          <p className="text-sm text-text-secondary mt-1">
            Monitor your receivables and high-priority collection tasks.
          </p>
        </div>
        {isDemoMode && (
          <div className="px-3 py-1 bg-brand-lavender text-brand text-xs font-semibold rounded-full border border-brand/20 shadow-sm">
            Demo Mode Active
          </div>
        )}
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Link href="/invoices" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg">
          <KpiCard
            title="Total Outstanding"
            value={summary?.total_outstanding_amount}
            currency={summary?.currency}
            icon={IndianRupee}
            isLoading={isLoading}
            className="hover:border-brand/40 transition-colors cursor-pointer h-full"
          />
        </Link>
        <Link href="/collections" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg">
          <KpiCard
            title="Overdue Amount"
            value={summary?.total_overdue_amount}
            currency={summary?.currency}
            icon={AlertTriangle}
            highlight="error"
            isLoading={isLoading}
            className="hover:border-red-300 transition-colors cursor-pointer h-full"
          />
        </Link>
        <Link href="/collections" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg">
          <KpiCard
            title="Overdue Invoices"
            value={summary?.overdue_invoices_count}
            isCurrency={false}
            icon={Clock}
            isLoading={isLoading}
            className="hover:border-brand/40 transition-colors cursor-pointer h-full"
          />
        </Link>
        <div className="block h-full">
          <KpiCard
            title="Total Collected"
            value={summary?.total_allocated_amount}
            currency={summary?.currency}
            icon={Target}
            highlight="success"
            isLoading={isLoading}
            className="h-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Receivables Aging Chart */}
        <div className="bg-white rounded-[16px] border border-surface-border p-5 shadow-sm lg:col-span-2 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <PieChart size={18} className="text-text-secondary" />
            <h2 className="text-base font-semibold text-text-primary">Receivables Aging</h2>
          </div>
          
          <div className="flex-1 flex flex-col justify-center min-h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center text-text-muted text-sm">Loading chart...</div>
            ) : chartData.length > 0 && chartData.some(d => d.amount > 0) ? (
              <div className="h-full w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: "#64748B" }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: "#64748B" }}
                      tickFormatter={(val) => `₹${(val / 1000)}k`}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: "#F8FAFC" }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Amount']}
                    />
                    <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={60}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.isOverdue ? "#D64550" : "#6D43D9"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                title="No aging data"
                description="There are no outstanding receivables to display."
              />
            )}
          </div>
        </div>

        {/* Priority Work Queue */}
        <div className="bg-white rounded-[16px] border border-surface-border p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-status-warning" />
              <h2 className="text-base font-semibold text-text-primary">Needs Attention</h2>
            </div>
            {isDemoMode && (
              <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Demo Data</span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-3 min-h-[300px] max-h-[400px] custom-scrollbar">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">Loading queue...</div>
            ) : displayItems.length > 0 ? (
              displayItems.map((item) => (
                <Link key={item.id} href={item.link} className="block group">
                  <div className="p-3 rounded-lg border border-surface-border bg-surface hover:bg-brand-lavender/50 hover:border-brand/30 transition-colors flex items-start gap-3">
                    <div className={`mt-0.5 shrink-0 ${item.priority === 'high' ? 'text-status-error' : item.type === 'promise' ? 'text-status-warning' : 'text-brand'}`}>
                      {item.type === 'invoice' && <FileText size={16} />}
                      {item.type === 'promise' && <CheckCircle2 size={16} />}
                      {item.type === 'analysis' && <MessageSquare size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-sm font-medium text-text-primary truncate group-hover:text-brand transition-colors">
                          {item.title}
                        </p>
                        {item.amount && (
                          <p className="text-sm font-semibold text-text-primary tabular-nums shrink-0">
                            {formatCurrency(Number(item.amount), item.currency)}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-text-secondary truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="All caught up!"
                description="There are no urgent collection tasks requiring your attention right now."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
