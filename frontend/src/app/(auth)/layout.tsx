import { AccoLogo } from "@/components/brand/AccoLogo";
import { AuthAnimatePresence } from "./AuthAnimatePresence";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4 sm:p-8">
      <div className="flex flex-col lg:flex-row w-full max-w-[1040px] bg-white rounded-[24px] shadow-2xl overflow-hidden min-h-[640px] relative">
        {/* Left: Branding panel (desktop only) */}
        <div className="hidden lg:flex flex-col w-[480px] bg-brand p-10 shrink-0 relative overflow-hidden">
          {/* Subtle animated background elements */}
          <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
             <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-white blur-[80px]" />
             <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-brand-dark blur-[80px]" />
          </div>

          <div className="relative z-10 flex flex-col h-full animate-fade-in">
            {/* Logo */}
            <div className="mb-auto">
              <AccoLogo size="md" className="mb-8" />
              <h1 className="text-3xl font-bold text-white mt-4 leading-tight tracking-tight">
                Get paid faster with AI-powered receivables and smarter collections.
              </h1>
              <p className="mt-4 text-base text-white/80 leading-relaxed max-w-sm">
                Manage outstanding invoices, understand customer replies, track payment promises, and prioritize collections — all in one intelligent workspace.
              </p>
            </div>

            {/* Value line */}
            <p className="mt-10 text-sm font-medium text-white/60 uppercase tracking-widest">
              AI assists. Humans decide.
            </p>
          </div>
        </div>

        {/* Right: Auth form */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 bg-surface-card relative">
          <div className="w-full max-w-[400px]">
            {/* Mobile logo */}
            <div className="flex justify-center mb-8 lg:hidden">
              <AccoLogo size="md" />
            </div>
            
            <AuthAnimatePresence>
              {children}
            </AuthAnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
