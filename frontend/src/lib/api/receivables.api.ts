import { AgingReportResponse, InvoiceBalanceResponse, ReceivablesSummary } from "@/types/receivables";
import { apiClient, isDemoMode } from "./client";
import { mockStore } from "../mock/mock-store";

export const receivablesApi = {
  async getInvoices(params?: { limit?: number; offset?: number; customer_id?: string }): Promise<InvoiceBalanceResponse[]> {
    if (isDemoMode) {
      return mockStore.getReceivablesInvoices(params);
    }
    const searchParams = new URLSearchParams();
    if (params?.customer_id) searchParams.set("customer_id", params.customer_id);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    const query = searchParams.toString();
    return apiClient<InvoiceBalanceResponse[]>(`/receivables/invoices${query ? `?${query}` : ""}`);
  },

  async getSummary(): Promise<ReceivablesSummary[]> {
    if (isDemoMode) {
      return mockStore.getReceivablesSummary();
    }
    return apiClient<ReceivablesSummary[]>("/receivables/summary");
  },

  async getAging(): Promise<AgingReportResponse[]> {
    if (isDemoMode) {
      return mockStore.getReceivablesAging();
    }
    return apiClient<AgingReportResponse[]>("/receivables/aging");
  }
};
