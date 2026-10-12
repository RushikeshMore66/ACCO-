"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/providers/AuthProvider";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

type AuthMode = "signin" | "signup";

interface LoginFormState {
  name?: string;
  email: string;
  password: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  general?: string;
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [form, setForm] = useState<LoginFormState>({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (mode === "signup" && !form.name?.trim()) {
      newErrors.name = "Full name is required";
    }
    if (!form.email.trim()) {
      newErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Enter a valid email address";
    }
    if (!form.password) {
      newErrors.password = "Password is required";
    } else if (mode === "signup" && form.password.length < 8) {
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
      const endpoint = mode === "signin" ? "/api/auth/login" : "/api/auth/register";
      const payload = mode === "signin" 
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors({
          general:
            data.detail ??
            `${mode === "signin" ? "Sign in" : "Sign up"} failed. Please try again.`,
        });
        return;
      }

      await refresh();

      // Safe redirect logic
      const nextUrl = searchParams.get("next");
      if (
        nextUrl &&
        nextUrl.startsWith("/") &&
        !nextUrl.startsWith("//") &&
        !nextUrl.includes("://") &&
        !nextUrl.includes("\\") &&
        nextUrl !== "/" &&
        nextUrl !== "/login"
      ) {
        router.push(nextUrl);
      } else {
        router.push("/dashboard");
      }
    } catch {
      setErrors({
        general: "Unable to connect. Please check your internet connection.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrors({});
    setForm({ name: "", email: "", password: "" });
  };

  return (
    <div className="w-full">
      {/* Animated Tab Switcher */}
      <div className="flex p-1 mb-8 bg-surface-border/50 rounded-lg relative">
        <button
          onClick={() => switchMode("signin")}
          className={`flex-1 relative z-10 py-2 text-sm font-medium transition-colors ${
            mode === "signin" ? "text-brand" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => switchMode("signup")}
          className={`flex-1 relative z-10 py-2 text-sm font-medium transition-colors ${
            mode === "signup" ? "text-brand" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Sign Up
        </button>
        <motion.div
          layout
          className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-md shadow-sm border border-surface-border/50 z-0"
          initial={false}
          animate={{
            left: mode === "signin" ? "4px" : "calc(50%)",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-text-primary">
          {mode === "signin" ? "Welcome back" : "Create an account"}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {mode === "signin"
            ? "Sign in to your ACCO workspace"
            : "Get started with AI-powered accounts receivable"}
        </p>
      </div>

      {/* General error */}
      <AnimatePresence>
        {errors.general && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden"
          >
            <div
              role="alert"
              className="px-4 py-3 rounded-lg bg-status-error-bg border border-status-error/20 text-sm text-status-error"
            >
              {errors.general}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} noValidate className="space-y-4 relative">
        <AnimatePresence mode="popLayout">
          {mode === "signup" && (
            <motion.div
              key="name-field"
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Input
                label="Full name"
                type="text"
                id="name"
                name="name"
                autoComplete="name"
                required
                placeholder="Jane Doe"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                error={errors.name}
                leftElement={<User size={14} />}
              />
            </motion.div>
          )}

          <motion.div key="email-field" layout="position" transition={{ duration: 0.2 }}>
            <Input
              label="Email address"
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={errors.email}
              leftElement={<Mail size={14} />}
            />
          </motion.div>

          <motion.div key="password-field" layout="position" transition={{ duration: 0.2 }}>
            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
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
          </motion.div>

          <motion.div key="forgot-password" layout="position" className="flex items-center justify-end" transition={{ duration: 0.2 }}>
            {mode === "signin" && (
              <Link
                href="/forgot-password"
                className="text-xs text-brand hover:text-brand-dark transition-colors"
              >
                Forgot password?
              </Link>
            )}
          </motion.div>

          <motion.div key="submit-button" layout="position" transition={{ duration: 0.2 }} className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full"
            >
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </motion.div>
        </AnimatePresence>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-full w-full flex items-center justify-center">Loading...</div>}>
      <LoginFormContent />
    </Suspense>
  );
}
