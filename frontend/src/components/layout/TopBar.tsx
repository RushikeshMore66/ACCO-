"use client";

import { Search, Bell, ChevronDown, LogOut, User, Settings } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useDemoMode } from "@/providers/DemoModeProvider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/DropdownMenu";
import { TeamPresence } from "./TeamPresence";
import Link from "next/link";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface TopBarProps {
  title?: string;
  breadcrumb?: { label: string; href?: string }[];
}

export function TopBar({ title, breadcrumb }: TopBarProps) {
  const { user, logout } = useAuth();
  const { isDemoMode } = useDemoMode();
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <header className="flex items-center gap-4 px-6 h-[60px] bg-white border-b border-surface-border shrink-0">
      {/* Page title / breadcrumb */}
      <div className="flex-1 min-w-0">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-1 text-sm">
              {breadcrumb.map((crumb, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && (
                    <span className="text-text-muted" aria-hidden>
                      /
                    </span>
                  )}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-text-secondary hover:text-text-primary transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-text-primary truncate">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : (
          <h1 className="text-base font-semibold text-text-primary truncate">
            {title ?? "ACCO"}
          </h1>
        )}
      </div>

      {/* Global search */}
      <div className="relative hidden md:flex items-center w-64">
        <Search
          size={14}
          className="absolute left-3 text-text-muted pointer-events-none"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Search invoices, customers…"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className={clsx(
            "w-full h-8 pl-8 pr-3 rounded-lg border border-surface-border bg-surface text-sm",
            "placeholder:text-text-muted text-text-primary",
            "focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
          )}
          aria-label="Global search"
        />
      </div>

      {/* Team presence */}
      <TeamPresence />

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="relative flex items-center justify-center w-8 h-8 rounded-md text-text-secondary hover:bg-surface hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="Notifications (3 unread)"
          >
            <Bell size={16} aria-hidden />
            <span
              className="absolute top-1 right-1 w-2 h-2 bg-status-error rounded-full"
              aria-hidden
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex justify-between items-center w-full">
            <span>Notifications</span>
            <span className="text-[10px] font-normal text-status-warning bg-status-warning-bg px-1.5 py-0.5 rounded border border-status-warning/20">Demo Mode</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push('/collections/payments')} className="flex flex-col items-start p-3 cursor-pointer">
            <span className="text-sm font-medium text-text-primary">New payment of 1,500.00 INR recorded.</span>
            <span className="text-xs text-text-muted mt-1">10 mins ago</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/communications')} className="flex flex-col items-start p-3 cursor-pointer">
            <span className="text-sm font-medium text-text-primary">Customer Action: Promise to pay confirmed.</span>
            <span className="text-xs text-text-muted mt-1">1 hour ago</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/invoices')} className="flex flex-col items-start p-3 cursor-pointer">
            <span className="text-sm font-medium text-text-primary">Invoice #INV-240 is now overdue.</span>
            <span className="text-xs text-text-muted mt-1">2 days ago</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="p-2 text-center">
            <button className="text-xs text-brand font-medium hover:underline focus:outline-none">Mark all as read</button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Demo mode badge */}
      {isDemoMode && (
        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-status-warning-bg text-status-warning border border-status-warning/20">
          Demo Data
        </span>
      )}

      {/* User profile menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="User profile menu"
          >
            {/* Avatar */}
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-brand text-white text-xs font-semibold shrink-0">
              {initials}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-xs font-medium text-text-primary max-w-[120px] truncate">
                {user?.full_name ?? "User"}
              </span>
              <span className="text-2xs text-text-muted capitalize">
                {user?.role?.toLowerCase().replace("_", " ") ?? "—"}
              </span>
            </div>
            <ChevronDown size={14} className="text-text-muted" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {user && (
            <>
              <div className="px-3 py-2 border-b border-surface-border">
                <p className="text-sm font-medium text-text-primary">
                  {user.full_name}
                </p>
                <p className="text-xs text-text-secondary">{user.email}</p>
              </div>
            </>
          )}
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuItem
            leftIcon={<User size={14} />}
            onSelect={() => router.push("/settings/profile")}
          >
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            leftIcon={<Settings size={14} />}
            onSelect={() => router.push("/settings")}
          >
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            leftIcon={<LogOut size={14} />}
            destructive
            onSelect={handleLogout}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
