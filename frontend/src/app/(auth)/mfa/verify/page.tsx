"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthMessage } from "@/components/auth/AuthMessage";
import { useAuth } from "@/providers/AuthProvider";

export default function MfaVerifyPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    const trimmed = value.trim();
    if (!trimmed) return setError("Enter your code");

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useRecovery ? { recovery_code: trimmed } : { code: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && /expired/i.test(data.detail ?? "")) {
          router.push("/login");
          return;
        }
        setError(data.detail ?? "Verification failed. Try again.");
        return;
      }
      await refresh();
      router.push("/dashboard");
    } catch {
      setError("Unable to connect. Please check your internet connection.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-text-primary">Two-step verification</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {useRecovery
            ? "Enter one of your single-use recovery codes."
            : "Enter the 6-digit code from your authenticator app."}
        </p>
      </div>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <AuthMessage kind="error">{error}</AuthMessage>}
        <Input
          label={useRecovery ? "Recovery code" : "Authentication code"}
          id="code"
          name="code"
          autoComplete="one-time-code"
          inputMode={useRecovery ? "text" : "numeric"}
          autoFocus
          required
          placeholder={useRecovery ? "xxxxx-xxxxx" : "123456"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          leftElement={<KeyRound size={14} />}
        />
        <Button type="submit" variant="primary" size="lg" isLoading={isLoading} className="w-full">
          Verify
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-brand hover:text-brand-dark"
            onClick={() => {
              setUseRecovery((v) => !v);
              setValue("");
              setError(null);
            }}
          >
            {useRecovery ? "Use authenticator app" : "Use a recovery code"}
          </button>
          <Link href="/login" className="text-text-secondary hover:text-text-primary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
