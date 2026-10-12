"use client";

import { useState } from "react";
import { invoicesApi } from "@/lib/api/invoices.api";
import { Button } from "@/components/ui/Button";
import { Upload, CheckCircle2, AlertCircle, FileText, ArrowRight } from "lucide-react";
import Link from "next/link";

interface ParsedInvoice {
  customer_name: string;
  customer_email: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  total_amount: string;
  description?: string;
  auto_issue?: boolean;
}

const SAMPLE_CSV = `customer_name,customer_email,invoice_number,issue_date,due_date,currency,total_amount,auto_issue
Acme Global,billing@acme.com,INV-9001,2026-09-01T00:00:00Z,2026-09-30T00:00:00Z,USD,4500.00,true
Starlight Tech,ap@starlight.io,INV-9002,2026-09-15T00:00:00Z,2026-10-15T00:00:00Z,USD,1250.50,true`;

export default function InvoiceImportPage() {
  const [csvContent, setCsvContent] = useState(SAMPLE_CSV);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseCsv = (text: string): ParsedInvoice[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) throw new Error("CSV must include a header and at least one data row.");
    
    const headers = lines[0].split(",").map(h => h.trim());
    const expectedHeaders = ["customer_name", "customer_email", "invoice_number", "issue_date", "due_date", "currency", "total_amount"];
    for (const req of expectedHeaders) {
      if (!headers.includes(req)) throw new Error(`Missing required CSV column: ${req}`);
    }

    const rows: ParsedInvoice[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(",").map(v => v.trim());
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });
      rows.push({
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        invoice_number: row.invoice_number,
        issue_date: row.issue_date,
        due_date: row.due_date,
        currency: row.currency?.toUpperCase() || "USD",
        total_amount: row.total_amount,
        auto_issue: row.auto_issue === "true" || row.auto_issue === "1",
      });
    }
    return rows;
  };

  const handleImport = async () => {
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const parsed = parseCsv(csvContent);
      const res = await invoicesApi.importBatch(parsed);
      setResult(res);
    } catch (err: any) {
      setError(err?.message || "Failed to process and import invoices.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Invoice Batch Ingestion</h1>
        <p className="text-sm text-text-secondary mt-1">
          Import receivable records via validated CSV. Matches customers by name or automatically creates them if an email is provided.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-surface-border p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Paste CSV Data (RFC-4180 format)
          </label>
          <textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            rows={8}
            className="w-full font-mono text-xs p-3 border border-surface-border rounded-md bg-surface/50 focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="customer_name,customer_email,invoice_number,issue_date,due_date,currency,total_amount,auto_issue"
          />
        </div>

        {error && (
          <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-md flex items-center gap-2 text-sm text-status-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            onClick={() => setCsvContent(SAMPLE_CSV)}
            variant="ghost"
            size="sm"
          >
            Reset to Sample Data
          </Button>
          <Button
            onClick={handleImport}
            disabled={isLoading || !csvContent.trim()}
            className="flex items-center gap-2"
          >
            <Upload size={16} />
            {isLoading ? "Validating & Ingesting..." : "Ingest Invoice Batch"}
          </Button>
        </div>
      </div>

      {result && (
        <div className="bg-white rounded-lg border border-surface-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-status-success" />
              <h2 className="text-base font-semibold text-text-primary">Ingestion Batch Summary</h2>
            </div>
            <div className="text-sm text-text-secondary">
              Processed: <span className="font-semibold text-text-primary">{result.total_processed}</span> | 
              Created: <span className="font-semibold text-status-success">{result.created_count}</span> | 
              Rejected: <span className="font-semibold text-status-error">{result.rejected_count}</span>
            </div>
          </div>

          <div className="divide-y divide-surface-border max-h-72 overflow-y-auto">
            {result.results.map((item: any, idx: number) => (
              <div key={idx} className="py-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-text-muted" />
                  <span className="font-medium text-text-primary">{item.invoice_number}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    item.status === "ISSUED" || item.status === "CREATED"
                      ? "bg-status-success/10 text-status-success"
                      : "bg-status-error/10 text-status-error"
                  }`}>
                    {item.status}
                  </span>
                  {item.error && <span className="text-xs text-text-muted">{item.error}</span>}
                  {item.invoice_id && (
                    <Link
                      href={`/invoices/${item.invoice_id}`}
                      className="text-xs text-brand hover:underline flex items-center gap-0.5"
                    >
                      View <ArrowRight size={12} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <Link href="/invoices">
              <Button variant="secondary" size="sm">Go to Invoices Directory</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
