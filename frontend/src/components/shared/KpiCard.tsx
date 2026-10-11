import { clsx } from "clsx";
import { CurrencyDisplay } from "./CurrencyDisplay";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: number | string | null | undefined;
  currency?: string;
  /** If true, value is formatted as currency. Otherwise as plain number. */
  isCurrency?: boolean;
  /** Percentage change vs previous period */
  trend?: number;
  /** Context label: "vs last month", "this week", etc. */
  period?: string;
  /** Explanatory description or methodology note */
  description?: string;
  /** Optional icon */
  icon?: LucideIcon;
  /** Optional highlight color override */
  highlight?: "error" | "warning" | "success" | "info";
  isLoading?: boolean;
  className?: string;
}

export function KpiCard({
  title,
  value,
  currency = "INR",
  isCurrency = true,
  trend,
  period,
  description,
  icon: Icon,
  highlight,
  isLoading = false,
  className,
}: KpiCardProps) {
  if (isLoading) {
    return (
      <div
        className={clsx(
          "bg-white rounded-lg border border-surface-border shadow-card p-5",
          className
        )}
      >
        <Skeleton height={12} width={80} className="mb-3" />
        <Skeleton height={28} width={120} className="mb-2" />
        <Skeleton height={10} width={60} />
      </div>
    );
  }

  const trendPositive = trend !== undefined && trend > 0;
  const trendNegative = trend !== undefined && trend < 0;
  const trendNeutral = trend !== undefined && trend === 0;

  const highlightClasses = {
    error: "border-l-4 border-l-status-error",
    warning: "border-l-4 border-l-status-warning",
    success: "border-l-4 border-l-status-success",
    info: "border-l-4 border-l-status-info",
  };

  return (
    <div
      className={clsx(
        "bg-white rounded-lg border border-surface-border shadow-card p-5 flex flex-col gap-1",
        highlight && highlightClasses[highlight],
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          {title}
        </span>
        {Icon && (
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-brand-lavender">
            <Icon size={14} className="text-brand" aria-hidden />
          </div>
        )}
      </div>

      {/* Value */}
      {isCurrency ? (
        <CurrencyDisplay
          amount={value}
          currency={currency}
          size="xl"
          className="mt-1"
        />
      ) : (
        <span className="text-xl font-bold text-text-primary tabular-nums mt-1">
          {value ?? "—"}
        </span>
      )}

      {/* Trend */}
      {trend !== undefined && (
        <div className="flex items-center gap-1.5 mt-0.5">
          {trendPositive && (
            <TrendingUp
              size={12}
              className="text-status-success"
              aria-hidden
            />
          )}
          {trendNegative && (
            <TrendingDown
              size={12}
              className="text-status-error"
              aria-hidden
            />
          )}
          {trendNeutral && (
            <Minus size={12} className="text-text-muted" aria-hidden />
          )}
          <span
            className={clsx(
              "text-xs font-medium",
              trendPositive && "text-status-success",
              trendNegative && "text-status-error",
              trendNeutral && "text-text-muted"
            )}
          >
            {trend > 0 ? "+" : ""}
            {trend.toFixed(1)}%
          </span>
          {period && (
            <span className="text-xs text-text-muted">{period}</span>
          )}
        </div>
      )}

      {trend === undefined && period && (
        <span className="text-xs text-text-muted mt-0.5">{period}</span>
      )}
      {description && (
        <span className="text-[11px] text-text-secondary mt-0.5 leading-snug" title={description}>
          {description}
        </span>
      )}
    </div>
  );
}
