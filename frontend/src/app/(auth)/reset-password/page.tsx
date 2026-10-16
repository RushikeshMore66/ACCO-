"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthMessage } from "@/components/auth/AuthMessage";
import { PASSWORD_MIN_LENGTH, validateNewPassword } from "@/lib/auth/password";

function ResetPasswordContent() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    const problem = validateNewPassword(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("Passwords do not match");

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "This reset link is invalid or has expired.");
        return;
      }
      setDone(true);
    } catch {
      setError("Unable to connect. Please check your internet connection.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <AuthMessage kind="error">This reset link is missing its token.</AuthMessage>
        <Link href="/forgot-password" className="text-sm text-brand hover:text-brand-dark">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-text-primary">Choose a new password</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Use at least {PASSWORD_MIN_LENGTH} characters. You will be signed out everywhere.
        </p>
      </div>
      {done ? (
        <div className="space-y-4">
          <AuthMessage kind="success">Your password has been updated.</AuthMessage>
          <Link href="/login" className="text-sm font-medium text-brand hover:text-brand-dark">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error && <AuthMessage kind="error">{error}</AuthMessage>}
          <Input
            label="New password"
            type="password"
            id="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftElement={<Lock size={14} />}
          />
          <Input
            label="Confirm new password"
            type="password"
            id="confirm"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            leftElement={<Lock size={14} />}
          />
          <Button type="submit" variant="primary" size="lg" isLoading={isLoading} className="w-full">
            Update password
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="w-full text-center">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
