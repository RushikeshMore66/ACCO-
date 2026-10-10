"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { clsx } from "clsx";

interface FilterOption {
  label: string;
  value: string;
}

interface FilterBarProps {
  /** Search input */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  /** Filter dropdowns */
  filters?: {
    label: string;
    key: string;
    options: FilterOption[];
    value?: string;
    onChange?: (value: string) => void;
  }[];

  /** Any active filter count */
  activeFilterCount?: number;
  onClearFilters?: () => void;

  /** Right-side actions slot */
  actions?: React.ReactNode;

  className?: string;
}

export function FilterBar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search…",
  filters = [],
  activeFilterCount = 0,
  onClearFilters,
  actions,
  className,
}: FilterBarProps) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center gap-2 p-4 border-b border-surface-border bg-white",
        className
      )}
    >
      {/* Search */}
      <div className="relative flex items-center flex-1 min-w-[200px] max-w-[320px]">
        <Search
          size={14}
          className="absolute left-3 text-text-muted pointer-events-none"
          aria-hidden
        />
        <input
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder={searchPlaceholder}
          className={clsx(
            "w-full h-8 pl-8 pr-3 rounded-lg border border-surface-border bg-surface text-sm",
            "placeholder:text-text-muted text-text-primary",
            "focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
          )}
          aria-label="Search"
        />
      </div>

      {/* Filter dropdowns */}
      {filters.map((filter) => (
        <div key={filter.key} className="relative">
          <select
            value={filter.value ?? ""}
            onChange={(e) => filter.onChange?.(e.target.value)}
            className={clsx(
              "h-8 pl-3 pr-7 rounded-lg border border-surface-border bg-white text-sm text-text-primary",
              "focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors",
              "appearance-none cursor-pointer",
              filter.value && "border-brand bg-brand-lavender text-brand"
            )}
            aria-label={filter.label}
          >
            <option value="">{filter.label}</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {/* Clear filters */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="xs"
          leftIcon={<X size={12} />}
          onClick={onClearFilters}
        >
          Clear ({activeFilterCount})
        </Button>
      )}

      {/* Filter icon for collapsed state */}
      {filters.length === 0 && (
        <button
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-surface-border bg-white text-sm text-text-secondary hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="Filters"
        >
          <SlidersHorizontal size={14} aria-hidden />
          <span>Filters</span>
        </button>
      )}

      {/* Spacer + right actions */}
      <div className="flex-1" />
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
