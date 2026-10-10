import { clsx } from "clsx";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftElement, rightElement, className, id, ...props },
  ref
) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-text-primary"
        >
          {label}
          {props.required && (
            <span className="ml-0.5 text-status-error" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      <div className="relative flex items-center">
        {leftElement && (
          <div className="absolute left-3 flex items-center pointer-events-none text-text-secondary">
            {leftElement}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            "w-full h-9 rounded-lg border bg-white text-sm text-text-primary placeholder:text-text-muted",
            "transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-0 focus:border-brand",
            error
              ? "border-status-error focus:ring-status-error"
              : "border-surface-border hover:border-text-muted",
            leftElement ? "pl-9" : "pl-3",
            rightElement ? "pr-9" : "pr-3",
            className
          )}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          {...props}
        />
        {rightElement && (
          <div className="absolute right-3 flex items-center text-text-secondary">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-status-error">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-text-secondary">
          {hint}
        </p>
      )}
    </div>
  );
});
