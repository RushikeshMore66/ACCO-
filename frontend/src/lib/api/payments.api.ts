import { PaymentResponse, PaymentCreate, PaymentAllocationCreate, PaymentReversalCreate } from "@/types/payment";
import { apiClient, isDemoMode } from "./client";
import { mockStore } from "../mock/mock-store";

export const paymentsApi = {
  async listPayments(params?: { customer_id?: string; limit?: number; offset?: number }): Promise<PaymentResponse[]> {
    if (isDemoMode) {
      return mockStore.listPayments(params);
    }
    const searchParams = new URLSearchParams();
    if (params?.customer_id) searchParams.set("customer_id", params.customer_id);
    if (params?.limit !== undefined) searchParams.set("limit", params.limit.toString());
    if (params?.offset !== undefined) searchParams.set("offset", params.offset.toString());
    const query = searchParams.toString();
    return apiClient<PaymentResponse[]>(`/payments${query ? `?${query}` : ""}`);
  },

  async getPayment(paymentId: string): Promise<PaymentResponse> {
    if (isDemoMode) {
      return mockStore.getPayment(paymentId);
    }
    return apiClient<PaymentResponse>(`/payments/${paymentId}`);
  },

  async recordPayment(data: PaymentCreate): Promise<PaymentResponse> {
    if (isDemoMode) {
      return mockStore.recordPayment(data);
    }
    return apiClient<PaymentResponse>("/payments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async allocatePayment(paymentId: string, data: PaymentAllocationCreate): Promise<PaymentResponse> {
    if (isDemoMode) {
      return mockStore.allocatePayment(paymentId, data);
    }
    return apiClient<PaymentResponse>(`/payments/${paymentId}/allocations`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async reversePayment(paymentId: string, data: PaymentReversalCreate): Promise<PaymentResponse> {
    if (isDemoMode) {
      return mockStore.reversePayment(paymentId, data);
    }
    return apiClient<PaymentResponse>(`/payments/${paymentId}/reverse`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
};
