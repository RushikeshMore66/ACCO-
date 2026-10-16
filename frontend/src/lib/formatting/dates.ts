/**
 * Date formatting utilities for ACCO.
 * All dates from the backend are UTC ISO strings.
 * Display in the user's local timezone unless a specific timezone is specified.
 */

/**
 * Format a date string or Date object as a localized date.
 * e.g. "10 Oct 2026"
 */
export function formatDate(
  value: string | Date | null | undefined,
  locale = "en-IN"
): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format as short date: "10 Oct"
 */
export function formatDateShort(
  value: string | Date | null | undefined,
  locale = "en-IN"
): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

/**
 * Format as date + time: "10 Oct 2026, 3:45 PM"
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  locale = "en-IN"
): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Return a human-readable relative label.
 * e.g. "2 days ago", "in 3 days", "today"
 */
export function formatRelative(
  value: string | Date | null | undefined
): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 0) return `in ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

/**
 * Calculate days overdue (positive = overdue, negative = not yet due).
 */
export function daysOverdue(dueDateValue: string | Date | null | undefined): number {
  if (!dueDateValue) return 0;
  const dueDate = typeof dueDateValue === "string" ? new Date(dueDateValue) : dueDateValue;
  if (isNaN(dueDate.getTime())) return 0;
  const now = new Date();
  const diffMs = now.getTime() - dueDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
