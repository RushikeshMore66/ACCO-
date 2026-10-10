"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/providers/AuthProvider";
import Link from "next/link";

interface LoginFormState {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [form, setForm] = useState<LoginFormState>({ email: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!form.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Enter a valid email address";
    }
    if (!form.password) {
      newErrors.password = "Password is required";
    } else if (form.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || isLoading) return;

    setIsLoading(true);
    setErrors({});

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors({
          general:
            data.detail ??
            "Sign in failed. Please check your credentials and try again.",
        });
        return;
      }

      // Hydrate the auth context from the now-set session cookie
      await refresh();
      router.push("/dashboard");
    } catch {
      setErrors({
        general: "Unable to connect. Please check your internet connection.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-text-primary">Sign in</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Sign in to your ACCO workspace
        </p>
      </div>

      {/* General error */}
      {errors.general && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 rounded-lg bg-status-error-bg border border-status-error/20 text-sm text-status-error"
        >
          {errors.general}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Email address"
          type="email"
          id="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          error={errors.email}
          leftElement={<Mail size={14} />}
        />

        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          id="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={form.password}
          onChange={(e) =>
            setForm((f) => ({ ...f, password: e.target.value }))
          }
          error={errors.password}
          leftElement={<Lock size={14} />}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-text-secondary hover:text-text-primary"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          }
        />

        <div className="flex items-center justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-brand hover:text-brand-dark transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          className="w-full"
        >
          Sign in
        </Button>
      </form>

      {/* Demo mode hint */}
      {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
        <div className="mt-6 p-4 rounded-lg bg-brand-lavender border border-brand/20">
          <p className="text-xs font-semibold text-brand mb-1">
            Demo Mode Active
          </p>
          <p className="text-xs text-text-secondary">
            You are in demo mode. No real backend authentication is required in
            this mode.
          </p>
        </div>
      )}
    </div>
  );
}
