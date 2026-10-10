"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  FolderKanban,
  MessageSquare,
  FileText,
  Users,
  Handshake,
  AlertTriangle,
  CreditCard,
  BarChart3,
  Brain,
  UserCog,
  ShieldCheck,
  ClipboardList,
  Settings,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { AccoLogo } from "@/components/brand/AccoLogo";
import { Tooltip, TooltipProvider } from "@/components/ui/Tooltip";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Collections", href: "/collections", icon: FolderKanban },
      {
        label: "Communications",
        href: "/communications",
        icon: MessageSquare,
      },
      { label: "Invoices", href: "/invoices", icon: FileText },
      { label: "Customers", href: "/customers", icon: Users },
      {
        label: "Payment Promises",
        href: "/collections/promises",
        icon: Handshake,
      },
      { label: "Disputes", href: "/collections/disputes", icon: AlertTriangle },
      {
        label: "Payments & Reconciliation",
        href: "/collections/payments",
        icon: CreditCard,
      },
    ],
  },
  {
    label: "Analytics",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3 },
      {
        label: "Collection Intelligence",
        href: "/reports/intelligence",
        icon: Brain,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Team & Users", href: "/settings/team", icon: UserCog },
      {
        label: "Collection Policies",
        href: "/policies",
        icon: ShieldCheck,
      },
      {
        label: "Activity & Audit Log",
        href: "/settings/audit",
        icon: ClipboardList,
      },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <TooltipProvider>
      <aside
        className={clsx(
          "flex flex-col h-full bg-white border-r border-surface-border transition-all duration-200 shrink-0",
          collapsed ? "w-16" : "w-64"
        )}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div
          className={clsx(
            "flex items-center border-b border-surface-border shrink-0",
            collapsed ? "justify-center px-3 py-4" : "px-4 py-4 gap-2"
          )}
        >
          <AccoLogo
            size={collapsed ? "icon" : "sm"}
            markOnly={collapsed}
            className="shrink-0"
          />
          {!collapsed && (
            <span className="text-2xs font-semibold uppercase tracking-widest text-text-muted">
              AI Collections
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
          {navGroups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-3 mb-1.5 text-2xs font-semibold uppercase tracking-widest text-text-muted">
                  {group.label}
                </p>
              )}
              <ul role="list" className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const NavLink = (
                    <Link
                      href={item.href}
                      className={clsx(
                        "nav-item",
                        collapsed ? "justify-center px-0 w-10 h-10 mx-auto" : "",
                        active && "active"
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon
                        size={16}
                        className="shrink-0"
                        aria-hidden="true"
                      />
                      {!collapsed && (
                        <span className="flex-1 truncate">{item.label}</span>
                      )}
                      {!collapsed && item.badge !== undefined && (
                        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-2xs font-bold bg-status-error text-white">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );

                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip content={item.label} side="right">
                          {NavLink}
                        </Tooltip>
                      ) : (
                        NavLink
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-surface-border p-2 shrink-0">
          <button
            onClick={onToggle}
            className={clsx(
              "flex items-center justify-center w-full h-8 rounded-md text-text-secondary",
              "hover:bg-surface hover:text-text-primary transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight size={16} aria-hidden />
            ) : (
              <>
                <ChevronLeft size={16} aria-hidden />
                <span className="ml-1.5 text-xs">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}

/** Controlled sidebar with its own collapse state */
export function SidebarWithState() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
  );
}
