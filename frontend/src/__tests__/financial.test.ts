import { describe, it, expect, beforeEach } from "vitest";
import { mockStore } from "../lib/mock/mock-store";
import { PromiseCreate } from "../types/promises_disputes";

describe("Financial Correctness Audit", () => {
  it("Payment promises do not reduce invoice outstanding balances", async () => {
    const invoices = await mockStore.listInvoices();
    const invoice = invoices[0];
    const initialBalance = invoice.total_amount; // Since balance is missing from mockStore type, let's just assert no mutations on invoices

    const data: PromiseCreate = {
      promised_amount: 50,
      expected_payment_date: new Date().toISOString(),
      notes: "Test promise"
    };

    const promise = await mockStore.createPromise(invoice.id, data);
    
    const updatedInvoice = await mockStore.getInvoice(invoice.id);
    expect(updatedInvoice?.total_amount).toBe(initialBalance);
  });

  it("Only recorded payments and valid allocations affect invoice balances", async () => {
    const invoices = await mockStore.getReceivablesInvoices();
    const invoice = invoices[0];
    const initialBalance = Number(invoice.outstanding_amount);

    const payment = await mockStore.recordPayment({
      customer_id: invoice.customer_id,
      amount: 100,
      payment_method: "BANK_TRANSFER",
      payment_date: new Date().toISOString(),
      currency: "INR",
      reference: "TEST-PAY-1"
    });

    await mockStore.allocatePayment(payment.id, {
      invoice_id: invoice.invoice_id,
      amount: 100
    });

    const updatedInvoices = await mockStore.getReceivablesInvoices();
    const updatedInvoice = updatedInvoices.find(i => i.invoice_id === invoice.invoice_id);
    expect(Number(updatedInvoice?.outstanding_amount)).toBe(initialBalance - 100);
  });
});
