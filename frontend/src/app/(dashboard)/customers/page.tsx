"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers.api";
import { Customer } from "@/types/customer";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { useDemoMode } from "@/providers/DemoModeProvider";
import { formatDateShort } from "@/lib/formatting/dates";
import {
  Users,
  Mail,
  Phone,
  Plus,
  Edit2,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Building2,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import Link from "next/link";

const PAGE_SIZE = 25;

type SortOption = "name_asc" | "name_desc" | "created_desc" | "created_asc";

export default function CustomersDirectoryPage() {
  const { isDemoMode } = useDemoMode();

  // Search, filter & pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active"); // "active" | "all"
  const [sortOption, setSortOption] = useState<SortOption>("name_asc");
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Fetch customers with server-side supported parameters
  const includeInactive = statusFilter === "all";
  const {
    data: customers = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["customers", { include_inactive: includeInactive }],
    queryFn: () =>
      customersApi.list({
        include_inactive: includeInactive,
        limit: 100, // authoritative batch size
      }),
  });

  // Client-side text filtering over fetched records (name, email, tax identifier)
  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
          (c.tax_identifier && c.tax_identifier.toLowerCase().includes(q))
      );
    }

    // Status filter if "inactive_only"
    if (statusFilter === "inactive_only") {
      result = result.filter((c) => !c.is_active);
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortOption) {
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "created_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [customers, searchTerm, statusFilter, sortOption]);

  // Pagination calculation
  const totalItems = filteredCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCustomers.slice(start, start + PAGE_SIZE);
  }, [filteredCustomers, currentPage]);

  const activeFilterCount =
    (searchTerm ? 1 : 0) + (statusFilter !== "active" ? 1 : 0);

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("active");
    setCurrentPage(1);
  };

  return (
    <div className="flex flex-col h-full bg-surface min-h-[calc(100vh-64px)]">
      {/* Top Header */}
      <div className="bg-white border-b border-surface-border px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              Customer Directory
            </h1>
            <Badge variant={isDemoMode ? "warning" : "info"}>
              {isDemoMode ? "Demo Mode" : "Live API"}
            </Badge>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Manage customer identity, track invoice exposure, and access accounts receivable workspaces.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            isLoading={isFetching && !isLoading}
            leftIcon={<RefreshCw size={13} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            leftIcon={<Plus size={14} />}
          >
            New Customer
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={(val) => {
          setSearchTerm(val);
          setCurrentPage(1);
        }}
        searchPlaceholder="Search by customer name, email, or tax ID…"
        filters={[
          {
            label: "Status",
            key: "status",
            value: statusFilter,
            onChange: (val) => {
              setStatusFilter(val || "active");
              setCurrentPage(1);
            },
            options: [
              { label: "Active Only", value: "active" },
              { label: "All Customers (Inc. Inactive)", value: "all" },
              { label: "Inactive Only", value: "inactive_only" },
            ],
          },
          {
            label: "Sort By",
            key: "sort",
            value: sortOption,
            onChange: (val) => setSortOption((val as SortOption) || "name_asc"),
            options: [
              { label: "Name (A → Z)", value: "name_asc" },
              { label: "Name (Z → A)", value: "name_desc" },
              { label: "Created (Newest)", value: "created_desc" },
              { label: "Created (Oldest)", value: "created_asc" },
            ],
          },
        ]}
        activeFilterCount={activeFilterCount}
        onClearFilters={handleClearFilters}
        actions={
          <div className="text-xs text-text-muted flex items-center gap-1.5 hidden sm:flex">
            <Info size={13} aria-hidden />
            <span>
              Showing {paginatedCustomers.length} of {totalItems} loaded
            </span>
          </div>
        }
      />

      {/* Main Table Area */}
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Dataset transparency callout */}
        <div className="bg-white border border-surface-border rounded-lg px-4 py-2 text-xs text-text-secondary flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Building2 size={13} className="text-text-muted" />
            <span>
              <strong>Authoritative Records:</strong> Active/inactive filters query the backend directly. Client-side search filters across currently loaded results.
            </span>
          </span>
          <span className="font-mono text-text-muted text-2xs">
            Batch Limit: 100 records
          </span>
        </div>

        {/* Error State */}
        {isError && (
          <div
            role="alert"
            className="bg-status-error-bg border border-status-error/30 rounded-lg p-5 flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-status-error shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-status-error">
                  Failed to load customers
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  {(error as any)?.message ||
                    "An unexpected error occurred while querying customer accounts. Please verify your connection or retry."}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="shrink-0"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Table Container */}
        <div className="bg-white rounded-lg border border-surface-border shadow-card overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-border bg-surface text-2xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Customer / Company</th>
                <th className="px-5 py-3 font-medium">Contact Person</th>
                <th className="px-5 py-3 font-medium">Tax Identifier</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Created Date</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border text-sm">
              {isLoading ? (
                // Skeletons
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="animate-pulse">
                    <td className="px-5 py-4">
                      <Skeleton height={16} width={180} className="mb-1" />
                      <Skeleton height={12} width={120} />
                    </td>
                    <td className="px-5 py-4">
                      <Skeleton height={14} width={140} className="mb-1" />
                      <Skeleton height={12} width={160} />
                    </td>
                    <td className="px-5 py-4">
                      <Skeleton height={14} width={100} />
                    </td>
                    <td className="px-5 py-4">
                      <Skeleton height={20} width={60} />
                    </td>
                    <td className="px-5 py-4">
                      <Skeleton height={14} width={90} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Skeleton height={28} width={80} className="ml-auto" />
                    </td>
                  </tr>
                ))
              ) : paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12">
                    <EmptyState
                      icon={Users}
                      title="No customers found"
                      description={
                        searchTerm || statusFilter !== "active"
                          ? "No customer records match your filter criteria. Try adjusting or clearing search terms."
                          : "No customer records exist yet. Click 'New Customer' to register your first client."
                      }
                      action={
                        activeFilterCount > 0
                          ? {
                              label: "Clear Filters",
                              onClick: handleClearFilters,
                            }
                          : {
                              label: "Create First Customer",
                              onClick: () => setIsCreateOpen(true),
                            }
                      }
                    />
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-surface/50 transition-colors group"
                  >
                    {/* Customer Name */}
                    <td className="px-5 py-3.5 align-top">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-medium text-text-primary hover:text-brand transition-colors flex items-center gap-1.5"
                      >
                        <span>{customer.name}</span>
                        <ExternalLink
                          size={12}
                          className="opacity-0 group-hover:opacity-100 text-brand transition-opacity"
                        />
                      </Link>
                      <div className="text-2xs text-text-muted font-mono mt-0.5">
                        ID: {customer.id.substring(0, 8)}…
                      </div>
                    </td>

                    {/* Contact Person */}
                    <td className="px-5 py-3.5 align-top text-text-secondary">
                      <div className="font-medium text-text-primary">
                        {customer.contact_name || "—"}
                      </div>
                      {customer.email && (
                        <div className="text-xs text-text-secondary mt-0.5 flex items-center gap-1.5">
                          <Mail size={12} className="text-text-muted shrink-0" />
                          <a
                            href={`mailto:${customer.email}`}
                            className="hover:text-brand transition-colors truncate max-w-[200px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {customer.email}
                          </a>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="text-xs text-text-secondary mt-0.5 flex items-center gap-1.5">
                          <Phone size={12} className="text-text-muted shrink-0" />
                          <a
                            href={`tel:${customer.phone}`}
                            className="hover:text-brand transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {customer.phone}
                          </a>
                        </div>
                      )}
                    </td>

                    {/* Tax Identifier */}
                    <td className="px-5 py-3.5 align-top text-xs font-mono text-text-secondary">
                      {customer.tax_identifier ? (
                        <span className="bg-surface px-2 py-0.5 rounded border border-surface-border">
                          {customer.tax_identifier}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5 align-top">
                      <Badge
                        variant={customer.is_active ? "success" : "muted"}
                        dot
                      >
                        {customer.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>

                    {/* Created Date */}
                    <td className="px-5 py-3.5 align-top text-xs text-text-secondary">
                      {formatDateShort(customer.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 align-top text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setEditingCustomer(customer)}
                          leftIcon={<Edit2 size={12} />}
                        >
                          Edit
                        </Button>
                        <Link href={`/customers/${customer.id}`}>
                          <Button variant="outline" size="xs">
                            Workspace
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination Footer */}
          {totalItems > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-surface-border bg-surface text-xs text-text-secondary">
              <div>
                Showing {(currentPage - 1) * PAGE_SIZE + 1} to{" "}
                {Math.min(currentPage * PAGE_SIZE, totalItems)} of {totalItems} customers
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  leftIcon={<ChevronLeft size={13} />}
                >
                  Previous
                </Button>
                <span className="px-2 text-text-primary font-medium">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  rightIcon={<ChevronRight size={13} />}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Customer Form Dialogs */}
      <CustomerFormDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <CustomerFormDialog
        isOpen={Boolean(editingCustomer)}
        customer={editingCustomer}
        onClose={() => setEditingCustomer(null)}
      />
    </div>
  );
}
