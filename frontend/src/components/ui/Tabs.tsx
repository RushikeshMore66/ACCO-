"use client";

import React, { createContext, useContext, useState } from "react";
import { clsx } from "clsx";

interface TabsContextValue {
  value: string;
  onValueChange: (val: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({
  value,
  defaultValue = "",
  onValueChange,
  children,
  className,
  ...props
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeValue = value !== undefined ? value : internalValue;

  const handleValueChange = (val: string) => {
    if (value === undefined) {
      setInternalValue(val);
    }
    onValueChange?.(val);
  };

  return (
    <TabsContext.Provider value={{ value: activeValue, onValueChange: handleValueChange }}>
      <div className={clsx("w-full", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function TabsList({ children, className, ...props }: TabsListProps) {
  return (
    <div
      role="tablist"
      className={clsx(
        "flex items-center gap-0.5 border-b border-surface-border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  children: React.ReactNode;
  className?: string;
  count?: number;
}

export function TabsTrigger({
  value,
  children,
  className,
  count,
  onClick,
  ...props
}: TabsTriggerProps) {
  const ctx = useContext(TabsContext);
  const isActive = ctx?.value === value;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    ctx?.onValueChange(value);
    onClick?.(e);
  };

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? "active" : "inactive"}
      onClick={handleClick}
      className={clsx(
        "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer",
        "text-text-secondary hover:text-text-primary",
        "border-b-2 border-transparent -mb-px",
        isActive
          ? "text-brand border-brand font-semibold"
          : "hover:border-surface-border",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset",
        className
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span
          className={clsx(
            "inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-xs border",
            isActive
              ? "bg-brand-lavender text-brand border-brand/20 font-semibold"
              : "bg-surface text-text-muted border-surface-border"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsContent({
  value,
  children,
  className,
  ...props
}: TabsContentProps) {
  const ctx = useContext(TabsContext);
  if (!ctx || ctx.value !== value) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      tabIndex={0}
      className={clsx(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand pt-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
