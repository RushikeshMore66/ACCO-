export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 border-r border-slate-200 bg-white p-6 flex flex-col gap-4">
        <div className="font-bold text-xl tracking-tight text-sky-600">ACCO Platform</div>
        <nav className="flex flex-col gap-2 text-sm text-slate-700">
          <a href="/dashboard" className="p-2 hover:bg-slate-100 rounded">Dashboard</a>
          <a href="/customers" className="p-2 hover:bg-slate-100 rounded">Customers</a>
          <a href="/invoices" className="p-2 hover:bg-slate-100 rounded">Invoices</a>
          <a href="/collections" className="p-2 hover:bg-slate-100 rounded">Collections</a>
          <a href="/communications" className="p-2 hover:bg-slate-100 rounded">Communications</a>
          <a href="/policies" className="p-2 hover:bg-slate-100 rounded">Policies</a>
          <a href="/reports" className="p-2 hover:bg-slate-100 rounded">Reports</a>
          <a href="/settings" className="p-2 hover:bg-slate-100 rounded">Settings</a>
        </nav>
      </aside>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
