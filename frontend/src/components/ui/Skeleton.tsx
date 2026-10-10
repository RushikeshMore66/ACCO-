import { clsx } from "clsx";
import { HTMLAttributes } from "react";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  height?: string | number;
  width?: string | number;
  rounded?: "sm" | "md" | "lg" | "full";
}

export function Skeleton({
  height,
  width,
  rounded = "md",
  className,
  style,
  ...props
}: SkeletonProps) {
  const roundedMap = {
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
  };

  return (
    <div
      role="status"
      aria-label="Loading"
      className={clsx(
        "skeleton-shimmer bg-surface-border",
        roundedMap[rounded],
        className
      )}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        width: typeof width === "number" ? `${width}px` : width,
        ...style,
      }}
      {...props}
    />
  );
}

/** A row of skeletons for table/list loading states */
export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 px-4">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          className="flex-1"
          style={{ flex: i === 0 ? 2 : 1 }}
        />
      ))}
    </div>
  );
}

/** A KPI card skeleton */
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-surface-border shadow-card p-5 flex flex-col gap-3">
      <Skeleton height={12} width={80} />
      <Skeleton height={28} width={120} />
      <Skeleton height={10} width={60} />
    </div>
  );
}
