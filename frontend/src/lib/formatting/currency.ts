/**
 * Currency formatting utilities for ACCO.
 *
 * Default locale: INR (₹) with Indian number system (e.g. ₹1,25,000)
 * Currency codes are treated as explicit data fields — never auto-detected.
 */

/**
 * Format a numeric amount as a currency string.
 *
 * @param amount - The numeric amount (number or string decimal)
 * @param currency - ISO 4217 currency code (e.g. "INR", "USD")
 * @param locale - BCP 47 locale string (default: "en-IN" for Indian number format)
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency = "INR",
  locale = "en-IN"
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const numeric = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numeric)) return "—";

  try {
    const isWhole = Number.isInteger(numeric);
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: isWhole ? 0 : 2,
    }).format(numeric);
  } catch {
    // Fallback for unsupported currencies
    return `${currency} ${numeric.toFixed(2)}`;
  }
}

/**
 * Format for compact display (e.g. ₹1.25L, ₹2.5Cr)
 */
export function formatCurrencyCompact(
  amount: number | string | null | undefined,
  currency = "INR",
  locale = "en-IN"
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const numeric = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numeric)) return "—";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return formatCurrency(amount, currency, locale);
  }
}

/**
 * Format a plain number with Indian number system grouping.
 */
export function formatNumber(
  value: number | string | null | undefined,
  locale = "en-IN"
): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numeric)) return "—";
  return new Intl.NumberFormat(locale).format(numeric);
}

/**
 * Get the currency symbol for a given ISO 4217 code.
 */
export function getCurrencySymbol(currency = "INR", locale = "en-IN"): string {
  try {
    return (
      new Intl.NumberFormat(locale, { style: "currency", currency })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}
