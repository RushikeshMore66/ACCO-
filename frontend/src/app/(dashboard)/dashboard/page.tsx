"use client";

import { useQuery } from "@tanstack/react-query";
import { receivablesApi } from "@/lib/api/receivables.api";
import { KpiCard } from "@/components/shared/KpiCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { AlertTriangle, Clock, Target, IndianRupee, PieChart } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Cell } from "recharts";

export default function DashboardPage() {
  const { data: summaries, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["receivables-summary"],
    queryFn: () => receivablesApi.getSummary(),
  });

  const { data: aging, isLoading: isAgingLoading } = useQuery({
    queryKey: ["receivables-aging"],
    queryFn: () => receivablesApi.getAging(),
  });

  // Default to first currency summary (INR in demo)
  const summary = summaries?.[0];
  const agingReport = aging?.[0];

  const isLoading = isSummaryLoading || isAgingLoading;

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

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-text-primary">Overview</h1>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Outstanding"
          value={summary?.total_outstanding_amount}
          currency={summary?.currency}
          icon={IndianRupee}
          isLoading={isLoading}
        />
        <KpiCard
          title="Overdue Amount"
          value={summary?.total_overdue_amount}
          currency={summary?.currency}
          icon={AlertTriangle}
          highlight="error"
          isLoading={isLoading}
        />
        <KpiCard
          title="Overdue Invoices"
          value={summary?.overdue_invoices_count}
          isCurrency={false}
          icon={Clock}
          isLoading={isLoading}
        />
        <KpiCard
          title="Total Collected"
          value={summary?.total_allocated_amount}
          currency={summary?.currency}
          icon={Target}
          highlight="success"
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receivables Aging Chart */}
        <div className="bg-white rounded-lg border border-surface-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <PieChart size={18} className="text-text-secondary" />
            <h2 className="text-base font-semibold text-text-primary">Receivables Aging</h2>
          </div>
          
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-text-muted text-sm">Loading chart...</div>
          ) : chartData.length > 0 && chartData.some(d => d.amount > 0) ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Amount']}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isOverdue ? "#EF4444" : "#6366F1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No aging data"
              description="There are no outstanding receivables to display."
              className="h-64"
            />
          )}
        </div>

        {/* Priority Queue (Placeholder for now) */}
        <div className="bg-white rounded-lg border border-surface-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-text-primary">Priority Work Queue</h2>
            <span className="text-xs font-medium text-brand cursor-pointer hover:underline">View All</span>
          </div>
          
          <EmptyState
            icon={AlertTriangle}
            title="All caught up!"
            description="There are no urgent collection tasks requiring your attention right now."
          />
        </div>
      </div>
    </div>
  );
}
