"use client";

import { useState } from "react";
import { Bell, CheckCheck, Clock, ExternalLink, AlertCircle, Info, ShieldAlert, CreditCard, MessageSquare, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useDemoMode } from "@/providers/DemoModeProvider";
import { settingsApi } from "@/lib/api/settings.api";
import { AppNotification } from "@/types/collections";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import { Badge } from "@/components/ui/Badge";
import { formatDateShort } from "@/lib/formatting/dates";

export function NotificationCenter() {
  const router = useRouter();
  const { isDemoMode } = useDemoMode();
  const queryClient = useQueryClient();

  const {
    data: notifications = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["notifications", { isDemoMode }],
    queryFn: () => settingsApi.listNotifications(isDemoMode),
    enabled: isDemoMode, // Only query in demo mode; live backend endpoint doesn't exist
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => settingsApi.markNotificationRead(id, isDemoMode),
    onSuccess: (updated) => {
      queryClient.setQueryData(["notifications", { isDemoMode }], updated);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => settingsApi.markAllNotificationsRead(isDemoMode),
    onSuccess: (updated) => {
      queryClient.setQueryData(["notifications", { isDemoMode }], updated);
    },
  });

  const unreadCount = isDemoMode
    ? notifications.filter((n) => !n.read).length
    : 0;

  const handleNotificationClick = (notif: AppNotification) => {
    if (isDemoMode && !notif.read) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.href) {
      router.push(notif.href);
    }
  };

  const getIcon = (type: AppNotification["type"]) => {
    switch (type) {
      case "INVOICE_OVERDUE":
        return <AlertCircle size={15} className="text-status-error shrink-0" />;
      case "PROMISE_APPROACHING":
      case "PROMISE_MISSED":
        return <Clock size={15} className="text-status-warning shrink-0" />;
      case "PAYMENT_RECORDED":
        return <CreditCard size={15} className="text-status-success shrink-0" />;
      case "DISPUTE_OPENED":
        return <ShieldAlert size={15} className="text-status-error shrink-0" />;
      case "CUSTOMER_REPLY":
        return <MessageSquare size={15} className="text-brand shrink-0" />;
      default:
        return <Bell size={15} className="text-text-muted shrink-0" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex items-center justify-center w-8 h-8 rounded-md text-text-secondary hover:bg-surface hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <Bell size={16} aria-hidden />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 w-2 h-2 bg-status-error rounded-full"
              aria-hidden
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[90vw]">
        {/* Header */}
        <DropdownMenuLabel className="flex justify-between items-center w-full px-3 py-2">
          <span className="font-semibold text-sm text-text-primary">
            Notifications
          </span>
          {isDemoMode ? (
            <span className="text-[10px] font-normal text-status-warning bg-status-warning-bg px-1.5 py-0.5 rounded border border-status-warning/20">
              Demo Simulation
            </span>
          ) : (
            <span className="text-[10px] font-normal text-text-muted bg-surface px-1.5 py-0.5 rounded border border-surface-border">
              Live API
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Live Mode Notice */}
        {!isDemoMode ? (
          <div className="p-4 text-center">
            <div className="w-8 h-8 rounded-full bg-surface border border-surface-border flex items-center justify-center text-text-muted mx-auto mb-2">
              <Bell size={14} />
            </div>
            <p className="text-xs font-semibold text-text-primary mb-1">
              Live Notification Service Unavailable
            </p>
            <p className="text-2xs text-text-secondary leading-relaxed">
              Global notification streams are not yet implemented on the FastAPI backend. No fake live notifications are generated.
            </p>
          </div>
        ) : (
          /* Demo Mode Notifications List */
          <div className="max-h-80 overflow-y-auto divide-y divide-surface-border">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted">
                No notifications to display.
              </div>
            ) : (
              notifications.map((notif) => (
                <DropdownMenuItem
                  key={notif.id}
                  onSelect={() => handleNotificationClick(notif)}
                  className={`flex items-start gap-2.5 p-3 cursor-pointer text-left transition-colors ${
                    !notif.read ? "bg-brand/5 font-medium" : "bg-white"
                  }`}
                >
                  <div className="mt-0.5">{getIcon(notif.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs text-text-primary truncate">
                        {notif.title}
                      </span>
                      {!notif.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                      )}
                    </div>
                    <p className="text-2xs text-text-secondary line-clamp-2 leading-snug">
                      {notif.message}
                    </p>
                    <span className="text-[10px] text-text-muted mt-1 block">
                      {formatDateShort(notif.timestamp)}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        {isDemoMode && notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="p-2 flex items-center justify-between text-2xs px-3">
              <span className="text-text-muted">
                {unreadCount} unread
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  markAllReadMutation.mutate();
                }}
                disabled={unreadCount === 0 || markAllReadMutation.isPending}
                className="text-brand font-medium hover:underline disabled:opacity-40 disabled:no-underline focus:outline-none"
              >
                Mark all as read
              </button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
