"use client";

import { useDemoMode } from "@/providers/DemoModeProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { UserCog, Plus, Shield } from "lucide-react";

const DEMO_USERS = [
  { id: "u-1", name: "Alice Admin", email: "alice@example.com", role: "OWNER", status: "ACTIVE" },
  { id: "u-2", name: "Bob Finance", email: "bob@example.com", role: "FINANCE_MANAGER", status: "ACTIVE" },
  { id: "u-3", name: "Charlie Collector", email: "charlie@example.com", role: "COLLECTOR", status: "ACTIVE" },
  { id: "u-4", name: "Dave Viewer", email: "dave@example.com", role: "VIEWER", status: "PENDING" },
];

export default function TeamManagementPage() {
  const { isDemoMode } = useDemoMode();

  return (
    <div className="flex flex-col h-full bg-surface p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            Team & Users
            <Badge variant="warning">Demo Mode Only</Badge>
          </h1>
          <p className="text-sm text-text-secondary mt-1">Manage team members and roles (Simulated View).</p>
        </div>
        <Button variant="primary">
          <Plus size={16} className="mr-2" /> Invite User
        </Button>
      </div>

      {!isDemoMode ? (
        <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden p-6 flex flex-col items-center text-center mt-6">
          <UserCog size={32} className="text-text-muted mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">Team Management Unavailable</h3>
          <p className="text-sm text-text-secondary max-w-sm">
            Live team management endpoints are not yet implemented. Please switch to Demo Mode to view simulated team layouts.
          </p>
        </div>
      ) : (

      <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-xs font-semibold text-text-secondary uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {DEMO_USERS.map((user) => (
              <tr key={user.id} className="hover:bg-surface/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-text-primary text-sm">{user.name}</div>
                      <div className="text-xs text-text-secondary">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                    <Shield size={14} />
                    {user.role.replace("_", " ")}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={user.status === "ACTIVE" ? "success" : "muted"}>{user.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" className="text-xs py-1 h-auto">Edit Role</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
