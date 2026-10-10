import { AccoLogo } from "@/components/brand/AccoLogo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-surface">
      {/* Left: Branding panel (desktop only) */}
      <div className="hidden lg:flex flex-col w-[440px] bg-brand p-10 shrink-0">
        {/* Logo */}
        <div className="mb-auto">
          <AccoLogo size="md" className="mb-6" />
          <h1 className="text-2xl font-bold text-white mt-4">
            AI-Powered Accounts
            <br />
            Receivable & Collections
          </h1>
          <p className="mt-3 text-sm text-white/70 leading-relaxed max-w-sm">
            Manage outstanding invoices, automate collection workflows, and
            convert customer communications into structured payment promises —
            all in one workspace.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="space-y-4 mt-10">
          {[
            "AI-assisted reply classification",
            "Deterministic collection policies",
            "Complete audit trail",
            "INR & multi-currency support",
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
              <span className="text-sm text-white/80">{feature}</span>
            </div>
          ))}
        </div>

        <p className="mt-10 text-xs text-white/40">
          © 2026 ACCO. AI assists. Humans decide.
        </p>
      </div>

      {/* Right: Auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <AccoLogo size="md" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
