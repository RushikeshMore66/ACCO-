import { clsx } from "clsx";

interface AuthMessageProps {
  kind: "error" | "success" | "info";
  children: React.ReactNode;
}

/** Inline status message used across the unauthenticated auth screens. */
export function AuthMessage({ kind, children }: AuthMessageProps) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={clsx(
        "px-4 py-3 rounded-lg border text-sm",
        kind === "error" &&
          "bg-status-error-bg border-status-error/20 text-status-error",
        kind === "success" &&
          "bg-status-success-bg border-status-success/20 text-status-success",
        kind === "info" && "bg-brand-lavender border-brand/20 text-text-secondary"
      )}
    >
      {children}
    </div>
  );
}
