"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDemoMode } from "@/providers/DemoModeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { settingsApi } from "@/lib/api/settings.api";
import {
  CollectionPolicy,
  CollectionPolicyUpdate,
  OrganizationProfile,
  OrganizationSettingsUpdate,
} from "@/types/collections";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { RoleBadge } from "@/components/team/RoleBadge";
import {
  Building2,
  Sliders,
  Bell,
  ShieldCheck,
  Mail,
  Lock,
  AlertCircle,
  CheckCircle2,
  Info,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Shield,
  Layers,
} from "lucide-react";
import Link from "next/link";

type SettingsSection =
  | "organization"
  | "account"
  | "notifications"
  | "policies"
  | "integrations";

export default function SettingsPage() {
  const { isDemoMode } = useDemoMode();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<SettingsSection>("organization");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Collection Policy State & Queries (Live Supported on Backend) ---
  const {
    data: policy,
    isLoading: isPolicyLoading,
    isError: isPolicyError,
    refetch: refetchPolicy,
  } = useQuery({
    queryKey: ["collectionPolicy", { isDemoMode }],
    queryFn: () => settingsApi.getCollectionPolicy(isDemoMode),
  });

  const [policyForm, setPolicyForm] = useState<CollectionPolicyUpdate | null>(null);

  // Initialize or synchronize policy form when policy loads
  const currentPolicy = policyForm || {
    initial_reminder_after_days: policy?.initial_reminder_after_days ?? 1,
    follow_up_after_days: policy?.follow_up_after_days ?? 8,
    escalation_after_days: policy?.escalation_after_days ?? 31,
    require_approval_before_send: policy?.require_approval_before_send ?? true,
    pause_collection_on_dispute: policy?.pause_collection_on_dispute ?? true,
    pause_collection_on_payment_promise: policy?.pause_collection_on_payment_promise ?? true,
  };

  const updatePolicyMutation = useMutation({
    mutationFn: (data: CollectionPolicyUpdate) =>
      settingsApi.updateCollectionPolicy(data, isDemoMode),
    onSuccess: (updated) => {
      queryClient.setQueryData(["collectionPolicy", { isDemoMode }], updated);
      setPolicyForm(null);
      setSuccessMessage(
        isDemoMode
          ? "Demo policy settings saved to local memory."
          : "Collection policy updated successfully on backend."
      );
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: (err: unknown) => {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to update collection policy"
      );
      setTimeout(() => setErrorMessage(null), 4000);
    },
  });

  // --- Organization Profile State & Queries (Placeholder on Backend) ---
  const {
    data: orgProfile,
    isLoading: isOrgLoading,
  } = useQuery({
    queryKey: ["orgProfile", { isDemoMode }],
    queryFn: () => settingsApi.getOrganizationProfile(isDemoMode),
    enabled: isDemoMode, // Only query in demo mode; live backend router is placeholder
  });

  const [orgName, setOrgName] = useState("ACCO Demo Corp");
  const [orgCurrency, setOrgCurrency] = useState("INR");
  const [taxIdentifier, setTaxIdentifier] = useState("GSTIN-27AAAAA0000A1Z5");

  const updateOrgMutation = useMutation({
    mutationFn: (data: OrganizationSettingsUpdate) =>
      settingsApi.updateOrganizationProfile(data, isDemoMode),
    onSuccess: () => {
      setSuccessMessage("Organization profile updated in Demo Mode.");
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  // Role permissions: Only OWNER and FINANCE_MANAGER can update policies
  const canManagePolicies =
    isDemoMode ||
    currentUser?.role === "OWNER" ||
    currentUser?.role === "FINANCE_MANAGER";

  const handlePolicySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManagePolicies) return;

    // Validate thresholds: initial < follow_up < escalation
    if (currentPolicy.initial_reminder_after_days < 1) {
      setErrorMessage("Initial reminder days must be at least 1 day.");
      return;
    }
    if (currentPolicy.follow_up_after_days <= currentPolicy.initial_reminder_after_days) {
      setErrorMessage("Follow-up cadence must be strictly greater than initial reminder days.");
      return;
    }
    if (currentPolicy.escalation_after_days <= currentPolicy.follow_up_after_days) {
      setErrorMessage("Escalation threshold must be strictly greater than follow-up cadence.");
      return;
    }

    setErrorMessage(null);
    updatePolicyMutation.mutate(currentPolicy);
  };

  const handleOrgSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDemoMode) return;
    updateOrgMutation.mutate({
      name: orgName,
      base_currency: orgCurrency,
      tax_identifier: taxIdentifier,
    });
  };

  return (
    <div className="flex flex-col h-full bg-surface p-6 overflow-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-text-primary">
              System & Administration Settings
            </h1>
            {isDemoMode ? (
              <Badge variant="warning" className="gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-status-warning shrink-0" />
                Demo Mode Only
              </Badge>
            ) : (
              <Badge variant="purple" className="gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                Live Organization
              </Badge>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Configure organization governance, collection policies, communication channels, and account preferences.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/settings/team">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Shield size={14} />
              <span>Team & User Roles</span>
            </Button>
          </Link>
          <Link href="/settings/audit">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Layers size={14} />
              <span>Activity Log</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Demo Banner */}
      {isDemoMode && (
        <div className="p-4 bg-status-warning-bg/40 border border-status-warning/30 rounded-xl flex items-start gap-3">
          <Info size={18} className="text-status-warning shrink-0 mt-0.5" />
          <div className="text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold text-text-primary">Simulated Settings Context: </span>
            You are operating in Demo Mode. Edits to organization profile, integrations, and preferences are held in isolated in-memory state.
            Changes will not affect production accounts or live database instances.
          </div>
        </div>
      )}

      {/* Global Alerts */}
      {successMessage && (
        <div className="p-3 bg-status-success-bg/50 border border-status-success/30 rounded-lg flex items-center gap-2 text-xs text-status-success">
          <CheckCircle2 size={15} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3 bg-status-error-bg/50 border border-status-error/30 rounded-lg flex items-center gap-2 text-xs text-status-error">
          <AlertCircle size={15} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Layout: Sidebar Navigation + Content Panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Navigation Tabs */}
        <div className="md:col-span-1 space-y-1">
          <button
            type="button"
            onClick={() => setActiveSection("organization")}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === "organization"
                ? "bg-brand text-white shadow-sm"
                : "bg-white text-text-primary border border-surface-border hover:bg-surface"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Building2 size={15} />
              <span>Organization Profile</span>
            </div>
            <ChevronRight size={13} className="opacity-60" />
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("policies")}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === "policies"
                ? "bg-brand text-white shadow-sm"
                : "bg-white text-text-primary border border-surface-border hover:bg-surface"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={15} />
              <span>Collection Policies</span>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded ${
                activeSection === "policies"
                  ? "bg-white/20 text-white"
                  : "bg-status-success-bg text-status-success"
              }`}
            >
              Live API
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("account")}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === "account"
                ? "bg-brand text-white shadow-sm"
                : "bg-white text-text-primary border border-surface-border hover:bg-surface"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Sliders size={15} />
              <span>Account Preferences</span>
            </div>
            <ChevronRight size={13} className="opacity-60" />
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("notifications")}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === "notifications"
                ? "bg-brand text-white shadow-sm"
                : "bg-white text-text-primary border border-surface-border hover:bg-surface"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Bell size={15} />
              <span>Notification Preferences</span>
            </div>
            <ChevronRight size={13} className="opacity-60" />
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("integrations")}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === "integrations"
                ? "bg-brand text-white shadow-sm"
                : "bg-white text-text-primary border border-surface-border hover:bg-surface"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Mail size={15} />
              <span>Communication Channels</span>
            </div>
            <ChevronRight size={13} className="opacity-60" />
          </button>
        </div>

        {/* Section Content Panel */}
        <div className="md:col-span-3">
          {/* SECTION 1: Organization Profile */}
          {activeSection === "organization" && (
            <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                  <Building2 size={18} className="text-brand" />
                  Organization Profile
                </h2>
                <p className="text-xs text-text-secondary mt-1">
                  Legal entity and fiscal configuration governing invoices and receivables.
                </p>
              </div>

              {!isDemoMode ? (
                <div className="p-4 bg-surface rounded-lg border border-surface-border space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Info size={16} className="text-text-muted shrink-0 mt-0.5" />
                    <div className="text-xs text-text-secondary leading-relaxed">
                      <strong className="text-text-primary">Live Backend Notice: </strong>
                      The FastAPI organization router (<code className="font-mono text-2xs bg-white px-1 py-0.5 rounded">/api/v1/organizations</code>) is a minimal placeholder.
                      Modifying organization profile attributes in live mode is disabled until the tenant-configuration milestone is implemented.
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
                    <div>
                      <span className="text-text-muted block">Organization ID</span>
                      <span className="font-mono font-medium text-text-primary">
                        {currentUser?.organization_id ?? "Default Organization"}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block">Authenticated User</span>
                      <span className="font-medium text-text-primary">
                        {currentUser?.full_name ?? "Live Session"} ({currentUser?.email ?? "—"})
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleOrgSubmit} className="space-y-4">
                  <Input
                    id="org-name"
                    label="Organization Name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      id="org-currency"
                      label="Base Operating Currency"
                      value={orgCurrency}
                      onChange={(e) => setOrgCurrency(e.target.value)}
                      required
                    />
                    <Input
                      id="org-tax-id"
                      label="Tax Identifier (GSTIN / VAT)"
                      value={taxIdentifier}
                      onChange={(e) => setTaxIdentifier(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      isLoading={updateOrgMutation.isPending}
                    >
                      Save Organization Settings (Demo)
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* SECTION 2: Collection Policies (Verified Live Endpoint) */}
          {activeSection === "policies" && (
            <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                    <ShieldCheck size={18} className="text-brand" />
                    Deterministic Collection Policies
                  </h2>
                  <p className="text-xs text-text-secondary mt-1">
                    Rule thresholds enforced by the backend collection engine (<code className="font-mono text-2xs bg-surface px-1 py-0.5 rounded">/api/v1/collections/policy</code>).
                  </p>
                </div>
                <Badge variant="success" className="text-2xs font-medium">
                  Verified Backend Contract
                </Badge>
              </div>

              {!canManagePolicies && (
                <div className="p-3 bg-status-warning-bg/40 border border-status-warning/20 rounded-lg flex items-center gap-2 text-xs text-text-secondary">
                  <Lock size={14} className="text-status-warning shrink-0" />
                  <span>
                    Your current role (<strong className="text-text-primary">{currentUser?.role}</strong>) grants read-only visibility.
                    Modifying collection policy thresholds requires <strong>OWNER</strong> or <strong>FINANCE_MANAGER</strong> permissions.
                  </span>
                </div>
              )}

              <form onSubmit={handlePolicySubmit} noValidate className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="policy-initial-days" className="block text-xs font-medium text-text-primary mb-1">
                      Initial Reminder (Days past due)
                    </label>
                    <input
                      id="policy-initial-days"
                      aria-label="Initial Reminder"
                      type="number"
                      min={1}
                      disabled={!canManagePolicies || updatePolicyMutation.isPending}
                      value={currentPolicy.initial_reminder_after_days}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setPolicyForm({
                          ...currentPolicy,
                          initial_reminder_after_days: isNaN(val) ? 0 : val,
                        });
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-surface-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-surface disabled:text-text-muted"
                    />
                    <p className="text-[11px] text-text-muted mt-1">
                      First gentle outreach cadence.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="policy-followup-days" className="block text-xs font-medium text-text-primary mb-1">
                      Follow-up Reminder (Days past due)
                    </label>
                    <input
                      id="policy-followup-days"
                      aria-label="Follow-up Reminder"
                      type="number"
                      min={2}
                      disabled={!canManagePolicies || updatePolicyMutation.isPending}
                      value={currentPolicy.follow_up_after_days}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setPolicyForm({
                          ...currentPolicy,
                          follow_up_after_days: isNaN(val) ? 0 : val,
                        });
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-surface-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-surface disabled:text-text-muted"
                    />
                    <p className="text-[11px] text-text-muted mt-1">
                      Firm collection follow-up threshold.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text-primary mb-1">
                      Escalation Notice (Days past due)
                    </label>
                    <input
                      type="number"
                      min={3}
                      disabled={!canManagePolicies || updatePolicyMutation.isPending}
                      value={currentPolicy.escalation_after_days}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setPolicyForm({
                          ...currentPolicy,
                          escalation_after_days: isNaN(val) ? 0 : val,
                        });
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-surface-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-surface disabled:text-text-muted"
                    />
                    <p className="text-[11px] text-text-muted mt-1">
                      Final demand or legal review trigger.
                    </p>
                  </div>
                </div>

                <div className="border-t border-surface-border pt-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Governance Gates
                  </h3>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canManagePolicies || updatePolicyMutation.isPending}
                      checked={currentPolicy.require_approval_before_send}
                      onChange={(e) =>
                        setPolicyForm({
                          ...currentPolicy,
                          require_approval_before_send: e.target.checked,
                        })
                      }
                      className="mt-0.5 rounded border-surface-border text-brand focus:ring-brand"
                    />
                    <div className="text-xs">
                      <span className="font-medium text-text-primary block">
                        Mandatory Human Approval Before Dispatch
                      </span>
                      <span className="text-text-secondary">
                        Drafts generated by AI or automations remain pending until reviewed by authorized finance personnel.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canManagePolicies || updatePolicyMutation.isPending}
                      checked={currentPolicy.pause_collection_on_dispute}
                      onChange={(e) =>
                        setPolicyForm({
                          ...currentPolicy,
                          pause_collection_on_dispute: e.target.checked,
                        })
                      }
                      className="mt-0.5 rounded border-surface-border text-brand focus:ring-brand"
                    />
                    <div className="text-xs">
                      <span className="font-medium text-text-primary block">
                        Automatically Pause Outreach on Active Dispute
                      </span>
                      <span className="text-text-secondary">
                        Halts dunning communication when an invoice has an open dispute ticket.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canManagePolicies || updatePolicyMutation.isPending}
                      checked={currentPolicy.pause_collection_on_payment_promise}
                      onChange={(e) =>
                        setPolicyForm({
                          ...currentPolicy,
                          pause_collection_on_payment_promise: e.target.checked,
                        })
                      }
                      className="mt-0.5 rounded border-surface-border text-brand focus:ring-brand"
                    />
                    <div className="text-xs">
                      <span className="font-medium text-text-primary block">
                        Honor Active Payment Promises
                      </span>
                      <span className="text-text-secondary">
                        Suspends aggressive collection cadences until the promised settlement date elapses.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!canManagePolicies}
                    isLoading={updatePolicyMutation.isPending}
                  >
                    Save Collection Policy
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* SECTION 3: Account Preferences */}
          {activeSection === "account" && (
            <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                  <Sliders size={18} className="text-brand" />
                  Account & Session Preferences
                </h2>
                <p className="text-xs text-text-secondary mt-1">
                  Session credentials and individual role authorization details.
                </p>
              </div>

              <div className="border border-surface-border rounded-lg p-4 bg-surface/30 space-y-3 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-surface-border">
                  <span className="text-text-muted">Full Name</span>
                  <span className="font-medium text-text-primary">{currentUser?.full_name ?? "Signed In User"}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-surface-border">
                  <span className="text-text-muted">Email</span>
                  <span className="font-mono text-text-primary">{currentUser?.email ?? "—"}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-surface-border">
                  <span className="text-text-muted">Authoritative Role</span>
                  <RoleBadge role={currentUser?.role ?? "VIEWER"} />
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-text-muted">Session Storage</span>
                  <span className="text-text-secondary">HttpOnly Cookie (BFF Protected)</span>
                </div>
              </div>

              <div className="p-3 bg-surface rounded-lg text-xs text-text-muted leading-relaxed">
                Profile password changes and multi-factor authentication are managed through your organization&apos;s primary identity gateway.
              </div>
            </div>
          )}

          {/* SECTION 4: Notification Preferences */}
          {activeSection === "notifications" && (
            <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                  <Bell size={18} className="text-brand" />
                  Notification Preferences
                </h2>
                <p className="text-xs text-text-secondary mt-1">
                  Control which event alerts trigger in-app indicators and team summaries.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    title: "Overdue Invoices",
                    desc: "Alerts when aging invoices transition beyond initial grace period.",
                    checked: true,
                  },
                  {
                    title: "Payment Promises Approaching Date",
                    desc: "Proactive notice 24 hours prior to a customer's promised settlement.",
                    checked: true,
                  },
                  {
                    title: "AI Inbound Reply Analysis",
                    desc: "Immediate alert when customer intent is classified as promise or dispute.",
                    checked: true,
                  },
                  {
                    title: "Payment Reconciliation Receipts",
                    desc: "Confirmation when funds are successfully matched to invoice balances.",
                    checked: false,
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3.5 border border-surface-border rounded-lg bg-surface/30"
                  >
                    <div>
                      <div className="font-medium text-xs text-text-primary">{item.title}</div>
                      <div className="text-2xs text-text-secondary mt-0.5">{item.desc}</div>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked={item.checked}
                      disabled={!isDemoMode}
                      className="rounded border-surface-border text-brand focus:ring-brand disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>

              {!isDemoMode && (
                <div className="p-3 bg-surface rounded-lg border border-surface-border text-xs text-text-muted">
                  Note: Backend notification preferences API is under development. In live mode, default organizational notification routing applies.
                </div>
              )}
            </div>
          )}

          {/* SECTION 5: Communication Channels & Integrations */}
          {activeSection === "integrations" && (
            <div className="bg-white rounded-xl border border-surface-border p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                  <Mail size={18} className="text-brand" />
                  Communication Integrations
                </h2>
                <p className="text-xs text-text-secondary mt-1">
                  External gateway configuration for outbound dunning emails and messages.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 border border-surface-border rounded-lg">
                  <div>
                    <div className="font-medium text-sm text-text-primary">Transactional Email (SMTP / SES)</div>
                    <div className="text-xs text-text-secondary">Outbound reminder dispatches, dunning notices, and balance statements.</div>
                  </div>
                  {isDemoMode ? (
                    <Badge variant="success">Simulated Connected</Badge>
                  ) : (
                    <Badge variant="muted">Backend Managed</Badge>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 border border-surface-border rounded-lg">
                  <div>
                    <div className="font-medium text-sm text-text-primary">ERP Accounting Sync (QuickBooks / SAP)</div>
                    <div className="text-xs text-text-secondary">Bidirectional ledger synchronization for invoice statuses and credit notes.</div>
                  </div>
                  <Button variant="outline" size="sm" disabled className="text-xs opacity-60">
                    Not Configured
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 border border-surface-border rounded-lg">
                  <div>
                    <div className="font-medium text-sm text-text-primary">WhatsApp Business API</div>
                    <div className="text-xs text-text-secondary">Direct customer messaging for high-priority payment commitments.</div>
                  </div>
                  <Button variant="outline" size="sm" disabled className="text-xs opacity-60">
                    Coming Soon
                  </Button>
                </div>
              </div>

              <div className="p-3.5 bg-surface border border-surface-border rounded-lg text-xs text-text-secondary leading-relaxed">
                <strong className="text-text-primary">Security Boundary: </strong>
                External gateway secrets and API tokens are never exposed or handled directly in client-side code.
                Integration credentials are managed strictly via backend environment variables.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
