"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthMessage } from "@/components/auth/AuthMessage";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok && res.status !== 202) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Unable to connect. Please check your internet connection.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-text-primary">Reset your password</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Enter your account email and we will send you a reset link.
        </p>
      </div>

      {done ? (
        <div className="space-y-4">
          <AuthMessage kind="success">
            If an account exists for that address, a reset link is on its way. The link expires in
            60 minutes and works once.
          </AuthMessage>
          <Link href="/login" className="text-sm text-brand hover:text-brand-dark">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error && <AuthMessage kind="error">{error}</AuthMessage>}
          <Input
            label="Email address"
            type="email"
            id="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftElement={<Mail size={14} />}
          />
          <Button type="submit" variant="primary" size="lg" isLoading={isLoading} className="w-full">
            Send reset link
          </Button>
          <div className="text-center">
            <Link href="/login" className="text-sm text-brand hover:text-brand-dark">
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
