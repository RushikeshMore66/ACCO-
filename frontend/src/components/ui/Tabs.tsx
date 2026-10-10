"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { clsx } from "clsx";

export const Tabs = TabsPrimitive.Root;

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <TabsPrimitive.List
      className={clsx(
        "flex items-center gap-0.5 border-b border-surface-border",
        className
      )}
    >
      {children}
    </TabsPrimitive.List>
  );
}

interface TabsTriggerProps {
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
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={clsx(
        "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors",
        "text-text-secondary hover:text-text-primary",
        "border-b-2 border-transparent -mb-px",
        "data-[state=active]:text-brand data-[state=active]:border-brand",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset",
        className
      )}
    >
      {children}
      {count !== undefined && (
        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-xs bg-surface border border-surface-border">
          {count}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Content
      value={value}
      className={clsx(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        className
      )}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
