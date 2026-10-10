import { formatCurrency } from "@/lib/formatting/currency";
import { clsx } from "clsx";

interface CurrencyDisplayProps {
  amount: number | string | null | undefined;
  currency?: string;
  locale?: string;
  size?: "sm" | "md" | "lg" | "xl";
  muted?: boolean;
  className?: string;
  /** Show as a negative (debit) amount */
  negative?: boolean;
}

const sizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base font-semibold",
  xl: "text-xl font-bold",
};

export function CurrencyDisplay({
  amount,
  currency = "INR",
  locale = "en-IN",
  size = "md",
  muted = false,
  negative = false,
  className,
}: CurrencyDisplayProps) {
  const formatted = formatCurrency(amount, currency, locale);
  const display = negative && formatted !== "—" ? `−${formatted}` : formatted;

  return (
    <span
      className={clsx(
        "tabular-nums font-mono",
        sizeClasses[size],
        muted
          ? "text-text-secondary"
          : negative
            ? "text-status-error"
            : "text-text-primary",
        className
      )}
    >
      {display}
    </span>
  );
}
