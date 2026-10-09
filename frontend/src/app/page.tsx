export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-slate-50">
      <div className="max-w-2xl text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          ACCO — AI Accounts Receivable Agent
        </h1>
        <p className="text-lg text-slate-600">
          Code-first, multi-tenant SaaS platform for AI-assisted accounts receivable,
          deterministic collection policies, and automated debtor workflows.
        </p>
        <div className="pt-4 flex gap-4 justify-center">
          <a
            href="/dashboard"
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500"
          >
            Go to Dashboard
          </a>
          <a
            href="/login"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Sign In
          </a>
        </div>
      </div>
    </main>
  );
}
