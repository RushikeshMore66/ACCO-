"use client";

import { useState } from "react";
import { UserRole, TeamInviteRequest } from "@/types/auth";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { AlertCircle, Shield, Info, CheckCircle2 } from "lucide-react";

interface DemoInviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (data: TeamInviteRequest) => Promise<void>;
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

export function DemoInviteMemberDialog({
  open,
  onOpenChange,
  onInvite,
}: DemoInviteMemberDialogProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("COLLECTOR");
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; general?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setRole("COLLECTOR");
    setErrors({});
    setSubmittedNotice(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      if (!newOpen) resetForm();
      onOpenChange(newOpen);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const newErrors: { fullName?: string; email?: string } = {};
    if (!fullName.trim()) {
      newErrors.fullName = "Full name is required";
    }
    if (!email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = "Please provide a valid email address";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await onInvite({
        full_name: fullName.trim(),
        email: email.trim(),
        role,
      });
      setSubmittedNotice(
        `Simulation: Invitation registered for ${email.trim()} with role ${role.replace("_", " ")}. (Demo mode: No actual email was sent).`
      );
      setTimeout(() => {
        setIsSubmitting(false);
        resetForm();
        onOpenChange(false);
      }, 1200);
    } catch (err: unknown) {
      setIsSubmitting(false);
      const msg = err instanceof Error ? err.message : "Failed to invite member";
      setErrors({ general: msg });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title="Invite Team Member"
        description="Add a colleague to your organization workspace in Demo Mode."
        size="md"
      >
        {submittedNotice ? (
          <div className="py-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-status-success-bg text-status-success flex items-center justify-center mb-3">
              <CheckCircle2 size={24} />
            </div>
            <h4 className="text-base font-semibold text-text-primary mb-1">
              Demo Invitation Registered
            </h4>
            <p className="text-sm text-text-secondary max-w-sm">
              {submittedNotice}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="p-3 bg-status-warning-bg/40 border border-status-warning/20 rounded-lg flex items-start gap-2.5">
              <Info size={16} className="text-status-warning shrink-0 mt-0.5" />
              <div className="text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">Demo Mode Simulation: </span>
                This action creates an isolated demo team record in local memory.
                No email dispatch occurs, and real backend authentication accounts are not modified.
              </div>
            </div>

            {errors.general && (
              <div className="p-3 bg-status-error-bg/50 border border-status-error/30 rounded-lg flex items-center gap-2 text-xs text-status-error">
                <AlertCircle size={14} className="shrink-0" />
                <span>{errors.general}</span>
              </div>
            )}

            <Input
              id="invite-fullname"
              label="Full Name"
              placeholder="e.g. Rachel Zane"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={errors.fullName}
              required
              disabled={isSubmitting}
            />

            <Input
              id="invite-email"
              label="Work Email Address"
              type="email"
              placeholder="e.g. rachel@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              required
              disabled={isSubmitting}
            />

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Assign Role <span className="text-status-error">*</span>
              </label>
              <div className="grid grid-cols-1 gap-2">
                {ROLES.map((r) => {
                  const isSelected = role === r.role;
                  return (
                    <button
                      key={r.role}
                      type="button"
                      onClick={() => setRole(r.role)}
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
              >
                Simulate Invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
