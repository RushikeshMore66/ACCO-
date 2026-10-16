import { describe, it, expect, beforeEach } from "vitest";
import { mockStore } from "@/lib/mock/mock-store";

describe("Mock Store Financial Integrity", () => {
  it("payment promise does not reduce invoice balance", async () => {
    // 1. Get initial invoice and its true outstanding balance
    const invoices = await mockStore.listInvoices();
    const invoice = invoices[0];
    
    const initialReceivables = await mockStore.getReceivablesInvoices();
    const initialReceivable = initialReceivables.find(r => r.invoice_id === invoice.id);
    const initialOutstanding = Number(initialReceivable?.outstanding_amount);
    const initialPaid = Number(initialReceivable?.paid_amount);

    // 2. Create a promise for the full amount
    await mockStore.createPromise(invoice.id, {
      promised_amount: invoice.total_amount,
      expected_payment_date: "2026-12-01",
    });

    // 3. Verify the receivables balance is unchanged
    const receivables = await mockStore.getReceivablesInvoices();
    const receivable = receivables.find(r => r.invoice_id === invoice.id);
    
    expect(Number(receivable?.outstanding_amount)).toBe(initialOutstanding);
    expect(Number(receivable?.paid_amount)).toBe(initialPaid);
  });

  it("dispute does not mark invoice as paid", async () => {
    const invoices = await mockStore.listInvoices();
    const invoice = invoices[0];

    // Create a dispute
    await mockStore.createDispute(invoice.id, {
      category: "MISSING_GOODS",
      description: "Did not receive items",
    });

    // Check receivables status
    const receivables = await mockStore.getReceivablesInvoices();
    const receivable = receivables.find(r => r.invoice_id === invoice.id);

    expect(receivable?.payment_status).not.toBe("PAID");
    expect(Number(receivable?.outstanding_amount)).toBeGreaterThan(0);
  });
});
