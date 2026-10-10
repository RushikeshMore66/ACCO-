import { clsx } from "clsx";
import { HTMLAttributes } from "react";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "purple"
  | "muted";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-surface-border text-text-secondary",
  success: "bg-status-success-bg text-status-success",
  warning: "bg-status-warning-bg text-status-warning",
  error: "bg-status-error-bg text-status-error",
  info: "bg-status-info-bg text-status-info",
  purple: "bg-brand-lavender text-brand",
  muted: "bg-gray-100 text-gray-500",
};

const dotClasses: Record<BadgeVariant, string> = {
  default: "bg-text-muted",
  success: "bg-status-success",
  warning: "bg-status-warning",
  error: "bg-status-error",
  info: "bg-status-info",
  purple: "bg-brand",
  muted: "bg-gray-400",
};

export function Badge({
  variant = "default",
  dot = false,
  children,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={clsx(
            "inline-block w-1.5 h-1.5 rounded-full shrink-0",
            dotClasses[variant]
          )}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
