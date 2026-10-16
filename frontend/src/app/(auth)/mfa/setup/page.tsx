"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthMessage } from "@/components/auth/AuthMessage";
import { useAuth } from "@/providers/AuthProvider";

interface SetupData {
  secret: string;
  otpauth_uri: string;
}

type Step = "scan" | "codes";

/**
 * Mandatory first-sign-in enrolment for OWNER / ADMIN accounts (also usable by anyone else
 * through the same endpoints). The page works with the limited enrolment session cookie.
 */
export default function MfaSetupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [step, setStep] = useState<Step>("scan");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // The secret is regenerated on every call: only start once (strict-mode double effect).
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
        if (res.status === 401) return router.push("/login");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.detail ?? "Could not start two-step verification setup.");
          return;
        }
        setSetup(data as SetupData);
      } catch {
        setError("Unable to connect. Please check your internet connection.");
      }
    })();
  }, [router]);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from your app");
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail ?? "That code was not accepted. Try again.");
        return;
      }
      setRecoveryCodes(data.recovery_codes ?? []);
      setStep("codes");
    } catch {
      setError("Unable to connect. Please check your internet connection.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFinish() {
    await refresh();
    router.push("/dashboard");
  }

  if (step === "codes") {
    return (
      <div className="w-full space-y-4">
        <h2 className="text-2xl font-bold text-text-primary">Save your recovery codes</h2>
        <AuthMessage kind="info">
          Each code works once if you lose access to your authenticator app. They are shown only now —
          store them somewhere safe (a password manager is ideal).
        </AuthMessage>
        <ul
          className="grid grid-cols-2 gap-2 rounded-lg border border-surface-border p-4 font-mono text-sm"
          aria-label="Recovery codes"
        >
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigator.clipboard?.writeText(recoveryCodes.join("\n"))}
          >
            Copy codes
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I have saved my recovery codes
        </label>
        <Button type="button" variant="primary" size="lg" disabled={!saved} onClick={handleFinish} className="w-full">
          Continue to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-text-primary">Set up two-step verification</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Owners and admins must protect their account with an authenticator app (Google
          Authenticator, Microsoft Authenticator, 1Password, Authy…).
        </p>
      </div>
      {error && (
        <div className="mb-4">
          <AuthMessage kind="error">{error}</AuthMessage>
        </div>
      )}
      {setup && (
        <form onSubmit={handleConfirm} noValidate className="space-y-4">
          <div className="flex justify-center rounded-lg border border-surface-border bg-white p-4">
            <QRCodeSVG value={setup.otpauth_uri} size={168} aria-label="Authenticator QR code" />
          </div>
          <p className="text-xs text-text-secondary">
            Cannot scan? Enter this key manually:{" "}
            <code className="select-all break-all font-mono text-text-primary">{setup.secret}</code>
          </p>
          <Input
            label="6-digit code"
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            leftElement={<ShieldCheck size={14} />}
          />
          <Button type="submit" variant="primary" size="lg" isLoading={isLoading} className="w-full">
            Verify and enable
          </Button>
        </form>
      )}
    </div>
  );
}
