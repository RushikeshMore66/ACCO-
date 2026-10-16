"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthMessage } from "@/components/auth/AuthMessage";

type State = "verifying" | "verified" | "failed";

function VerifyEmailContent() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>(token ? "verifying" : "failed");
  const [detail, setDetail] = useState<string>("");
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against React strict-mode double invocation.
    if (!token || started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        setDetail(data.detail ?? "");
        setState(res.ok ? "verified" : "failed");
      } catch {
        setDetail("Unable to connect. Please try again.");
        setState("failed");
      }
    })();
  }, [token]);

  return (
    <div className="w-full space-y-4">
      <h2 className="text-2xl font-bold text-text-primary">Email verification</h2>
      {state === "verifying" && <AuthMessage kind="info">Verifying your email address…</AuthMessage>}
      {state === "verified" && (
        <>
          <AuthMessage kind="success">Your email address is verified.</AuthMessage>
          <Link href="/login" className="text-sm font-medium text-brand hover:text-brand-dark">
            Continue to sign in
          </Link>
        </>
      )}
      {state === "failed" && (
        <>
          <AuthMessage kind="error">
            {detail || "This verification link is invalid or has expired."}
          </AuthMessage>
          <Link href="/login" className="text-sm text-brand hover:text-brand-dark">
            Back to sign in
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="w-full text-center">Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
