import { UserRole } from "@/types/auth";
import { Crown, Briefcase, PhoneCall, Eye } from "lucide-react";
import { RoleBadge } from "./RoleBadge";

export interface RoleDefinition {
  role: UserRole;
  title: string;
  icon: typeof Crown;
  summary: string;
  enforcedBackendCapabilities: string[];
}

export const ACCO_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: "OWNER",
    title: "Owner",
    icon: Crown,
    summary: "Full administrative and financial control over organization tenancy.",
    enforcedBackendCapabilities: [
      "Manage collection policies and governance limits",
      "Authorize dispute resolution and debt write-offs",
      "Approve critical outbound collection communications",
      "Access all financial ledgers, audit logs, and reports",
    ],
  },
  {
    role: "FINANCE_MANAGER",
    title: "Finance Manager",
    icon: Briefcase,
    summary: "Supervises AR workflows, cash-flow allocation, and debt governance.",
    enforcedBackendCapabilities: [
      "Review and resolve customer disputes",
      "Approve outbound collection reminder templates",
      "Record incoming payments and allocate to invoices",
      "Full visibility into accounts receivable aging ledgers",
    ],
  },
  {
    role: "COLLECTOR",
    title: "Collector",
    icon: PhoneCall,
    summary: "Operational collector managing day-to-day debtor outreach.",
    enforcedBackendCapabilities: [
      "Review AI reply analysis and classify intent",
      "Record and edit payment promises with explicit dates",
      "Draft collection outreach messages and record internal notes",
      "Submit dispute tickets for managerial review",
    ],
  },
  {
    role: "VIEWER",
    title: "Viewer",
    icon: Eye,
    summary: "Read-only stakeholder visibility across financial and collections ledgers.",
    enforcedBackendCapabilities: [
      "View invoice directory and debtor balances",
      "Read conversation logs and message threads",
      "Inspect payment promises and open disputes",
      "No mutation or approval privileges on backend endpoints",
    ],
  },
];

export function RoleClarityCards() {
  return (
    <div className="bg-white rounded-xl border border-surface-border shadow-sm p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-text-primary">
          ACCO Roles & Enforced Permissions
        </h2>
        <p className="text-xs text-text-secondary mt-0.5">
          Backend authority governs all state transitions. Frontend access reflects verified RBAC policies.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ACCO_ROLE_DEFINITIONS.map((def) => {
          const Icon = def.icon;
          return (
            <div
              key={def.role}
              className="p-4 rounded-lg border border-surface-border bg-surface/40 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <RoleBadge role={def.role} />
                  <span className="text-[11px] font-mono text-text-muted">
                    {def.role}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mb-3 leading-relaxed">
                  {def.summary}
                </p>
                <div className="border-t border-surface-border pt-2.5">
                  <span className="text-[11px] font-semibold text-text-primary uppercase tracking-wider block mb-1.5">
                    Backend Enforced Rights:
                  </span>
                  <ul className="space-y-1">
                    {def.enforcedBackendCapabilities.map((cap, i) => (
                      <li
                        key={i}
                        className="text-2xs text-text-secondary flex items-start gap-1.5"
                      >
                        <span className="w-1 h-1 rounded-full bg-brand shrink-0 mt-1.5" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
