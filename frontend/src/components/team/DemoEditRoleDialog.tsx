"use client";

import { useState } from "react";
import { TeamMember, UserRole, TeamRoleUpdateRequest } from "@/types/auth";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AlertCircle, Shield, Info, CheckCircle2 } from "lucide-react";

interface DemoEditRoleDialogProps {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateRole: (data: TeamRoleUpdateRequest) => Promise<void>;
}

const ROLES: { role: UserRole; title: string; desc: string }[] = [
  {
    role: "OWNER",
    title: "Owner",
    desc: "Full organization authority, collection policies, dispute resolutions, and administration.",
  },
  {
    role: "FINANCE_MANAGER",
    title: "Finance Manager",
    desc: "Oversees cash collection strategies, approves outbound communications, and resolves disputes.",
  },
  {
    role: "COLLECTOR",
    title: "Collector",
    desc: "Reviews communication replies, executes outreach, drafts payment promises, and records notes.",
  },
  {
    role: "VIEWER",
    title: "Viewer",
    desc: "Read-only visibility across aging invoices, reports, payments, and communication threads.",
  },
];

export function DemoEditRoleDialog({
  member,
  open,
  onOpenChange,
  onUpdateRole,
}: DemoEditRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(member?.role ?? "VIEWER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Synchronize initial selection when member changes
  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      if (newOpen && member) {
        setSelectedRole(member.role);
        setError(null);
        setSuccessNotice(null);
      }
      onOpenChange(newOpen);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || isSubmitting) return;

    if (selectedRole === member.role) {
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onUpdateRole({
        user_id: member.id,
        role: selectedRole,
      });
      setSuccessNotice(
        `Simulation: ${member.full_name}'s role updated to ${selectedRole.replace("_", " ")}. (Demo mode: Live permissions unchanged).`
      );
      setTimeout(() => {
        setIsSubmitting(false);
        onOpenChange(false);
      }, 1000);
    } catch (err: unknown) {
      setIsSubmitting(false);
      const msg = err instanceof Error ? err.message : "Failed to update role";
      setError(msg);
    }
  };

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={`Edit Role: ${member.full_name}`}
        description="Modify role assignment in Demo Mode."
        size="md"
      >
        {successNotice ? (
          <div className="py-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-status-success-bg text-status-success flex items-center justify-center mb-3">
              <CheckCircle2 size={24} />
            </div>
            <h4 className="text-base font-semibold text-text-primary mb-1">
              Role Updated (Demo)
            </h4>
            <p className="text-sm text-text-secondary max-w-sm">
              {successNotice}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-surface border border-surface-border rounded-lg flex items-center justify-between text-xs">
              <div>
                <span className="text-text-muted">Member Email: </span>
                <span className="font-mono text-text-primary font-medium">{member.email}</span>
              </div>
              <div>
                <span className="text-text-muted">Current Role: </span>
                <span className="font-semibold text-text-primary">{member.role.replace("_", " ")}</span>
              </div>
            </div>

            <div className="p-3 bg-status-warning-bg/40 border border-status-warning/20 rounded-lg flex items-start gap-2.5">
              <Info size={16} className="text-status-warning shrink-0 mt-0.5" />
              <div className="text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">Demo Role Isolation: </span>
                Altering this role only affects the in-memory demo directory. Real backend authorization
                tokens and privileges are unaffected.
              </div>
            </div>

            {error && (
              <div className="p-3 bg-status-error-bg/50 border border-status-error/30 rounded-lg flex items-center gap-2 text-xs text-status-error">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Select New Role
              </label>
              <div className="grid grid-cols-1 gap-2">
                {ROLES.map((r) => {
                  const isSelected = selectedRole === r.role;
                  return (
                    <button
                      key={r.role}
                      type="button"
                      onClick={() => setSelectedRole(r.role)}
                      disabled={isSubmitting}
                      className={`text-left p-2.5 rounded-lg border text-sm transition-all flex items-start gap-3 ${
                        isSelected
                          ? "border-brand bg-brand-lavender/30 ring-1 ring-brand"
                          : "border-surface-border bg-white hover:bg-surface/60"
                      }`}
                    >
                      <div className={`mt-0.5 p-1 rounded ${isSelected ? "text-brand" : "text-text-muted"}`}>
                        <Shield size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">{r.title}</span>
                          {r.role === "VIEWER" && (
                            <Badge variant="muted" className="text-[10px] py-0 px-1.5">Read Only</Badge>
                          )}
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5 leading-snug">
                          {r.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="px-0 pt-4 pb-0 -mx-6 -mb-5 px-6 border-t mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                disabled={selectedRole === member.role}
              >
                Update Role (Demo)
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
