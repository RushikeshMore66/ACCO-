import { Invoice, InvoiceCreate, InvoiceUpdate, InvoiceVoid } from "@/types/invoice";
import { InvoiceBalanceResponse } from "@/types/receivables";
import { apiClient, isDemoMode } from "./client";
import { mockStore } from "../mock/mock-store";

export const invoicesApi = {
  async list(params?: {
    customer_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Invoice[]> {
    if (isDemoMode) {
      return mockStore.listInvoices(params);
    }
    const searchParams = new URLSearchParams();
    if (params?.customer_id) searchParams.set("customer_id", params.customer_id);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit !== undefined) searchParams.set("limit", params.limit.toString());
    if (params?.offset !== undefined) searchParams.set("offset", params.offset.toString());
    
    const query = searchParams.toString();
    return apiClient<Invoice[]>(`/invoices${query ? `?${query}` : ""}`);
  },

  async get(id: string): Promise<Invoice> {
    if (isDemoMode) {
      const invoice = await mockStore.getInvoice(id);
      if (!invoice) throw new Error("Not found");
      return invoice;
    }
    return apiClient<Invoice>(`/invoices/${id}`);
  },

  async getBalance(id: string): Promise<InvoiceBalanceResponse> {
    if (isDemoMode) {
      return mockStore.getInvoiceBalance(id);
    }
    return apiClient<InvoiceBalanceResponse>(`/invoices/${id}/balance`);
  },

  async create(data: InvoiceCreate): Promise<Invoice> {
    if (isDemoMode) {
      return mockStore.createInvoice(data);
    }
    return apiClient<Invoice>("/invoices", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: InvoiceUpdate): Promise<Invoice> {
    if (isDemoMode) {
      return mockStore.updateInvoice(id, data);
    }
    return apiClient<Invoice>(`/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async voidInvoice(id: string, data: InvoiceVoid): Promise<Invoice> {
    if (isDemoMode) {
      return mockStore.voidInvoice(id, data);
    }
    return apiClient<Invoice>(`/invoices/${id}/void`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async importBatch(invoices: any[]): Promise<{
    total_processed: number;
    created_count: number;
    rejected_count: number;
    results: Array<{ invoice_number: string; status: string; invoice_id?: string; error?: string }>;
  }> {
    if (isDemoMode) {
      return {
        total_processed: invoices.length,
        created_count: invoices.length,
        rejected_count: 0,
        results: invoices.map(i => ({ invoice_number: i.invoice_number, status: "CREATED" }))
      };
    }
    return apiClient("/invoices/import", {
      method: "POST",
      body: JSON.stringify({ invoices }),
    });
  },
};
