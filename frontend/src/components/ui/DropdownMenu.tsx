"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

interface DropdownMenuContentProps {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
}

export function DropdownMenuContent({
  children,
  align = "end",
  sideOffset = 6,
  className,
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={clsx(
          "z-50 min-w-[180px] bg-white rounded-lg border border-surface-border shadow-dropdown py-1",
          "animate-fade-in",
          className
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

interface DropdownMenuItemProps {
  children: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  leftIcon?: React.ReactNode;
  className?: string;
}

export function DropdownMenuItem({
  children,
  onSelect,
  disabled,
  destructive,
  leftIcon,
  className,
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={clsx(
        "flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer outline-none",
        "transition-colors select-none",
        destructive
          ? "text-status-error focus:bg-status-error-bg"
          : "text-text-primary focus:bg-surface",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {leftIcon && (
        <span className="shrink-0 text-text-secondary" aria-hidden>
          {leftIcon}
        </span>
      )}
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <DropdownMenuPrimitive.Separator
      className={clsx("my-1 h-px bg-surface-border", className)}
    />
  );
}

export function DropdownMenuLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DropdownMenuPrimitive.Label
      className={clsx(
        "px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-text-muted",
        className
      )}
    >
      {children}
    </DropdownMenuPrimitive.Label>
  );
}
