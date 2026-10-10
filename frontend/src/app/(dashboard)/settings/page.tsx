"use client";

import { useDemoMode } from "@/providers/DemoModeProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export default function SettingsPage() {
  const { isDemoMode } = useDemoMode();

  return (
    <div className="flex flex-col h-full bg-surface p-6 overflow-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          Organization Settings
          <Badge variant="warning">Demo Mode Only</Badge>
        </h1>
        <p className="text-sm text-text-secondary mt-1">Configure organization profile and preferences.</p>
      </div>

      {!isDemoMode ? (
        <div className="bg-white rounded-lg border border-surface-border shadow-sm overflow-hidden p-6 flex flex-col items-center text-center mt-6">
          <h3 className="text-lg font-medium text-text-primary mb-2">Settings Unavailable</h3>
          <p className="text-sm text-text-secondary max-w-sm">
            Live `/organizations` backend routes are not yet implemented. Please switch to Demo Mode to view simulated settings.
          </p>
        </div>
      ) : (

      <div className="max-w-2xl bg-white rounded-lg border border-surface-border shadow-sm p-6 space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-3">Organization Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Organization Name</label>
              <input type="text" defaultValue="ACCO Demo Corp" disabled className="w-full p-2 border border-surface-border rounded-md bg-surface text-text-muted" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Base Currency</label>
              <input type="text" defaultValue="INR" disabled className="w-full p-2 border border-surface-border rounded-md bg-surface text-text-muted" />
            </div>
          </div>
        </div>
        
        <hr className="border-surface-border" />

        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-3">Integrations</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border border-surface-border rounded-lg">
              <div>
                <div className="font-medium text-sm text-text-primary">Email Provider (SMTP)</div>
                <div className="text-xs text-text-secondary">Configured for outbound collection notices.</div>
              </div>
              <Badge variant="success">Connected</Badge>
            </div>
            <div className="flex items-center justify-between p-3 border border-surface-border rounded-lg">
              <div>
                <div className="font-medium text-sm text-text-primary">Accounting Sync (ERP)</div>
                <div className="text-xs text-text-secondary">Not configured.</div>
              </div>
              <Button variant="outline" className="text-xs py-1 h-auto" disabled>Configure</Button>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end pt-4">
          <Button variant="primary" disabled>Save Changes</Button>
        </div>
      </div>
      )}
    </div>
  );
}
