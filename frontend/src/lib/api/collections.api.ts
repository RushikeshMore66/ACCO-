import {
  PaymentPromise,
  PromiseCreate,
  PromiseCancel,
  Dispute,
  DisputeCreate,
  DisputeResolve,
  DisputeReject,
} from "@/types/promises_disputes";
import { apiClient, isDemoMode } from "./client";
import { mockStore } from "../mock/mock-store";

export const collectionsApi = {
  async listAllPromises(): Promise<PaymentPromise[]> {
    if (isDemoMode) {
      return mockStore.listAllPromises();
    }
    return apiClient<PaymentPromise[]>("/collections/promises");
  },

  async getPromises(invoiceId: string): Promise<PaymentPromise[]> {
    if (isDemoMode) {
      return mockStore.getPromises(invoiceId);
    }
    return apiClient<PaymentPromise[]>(`/collections/invoices/${invoiceId}/promises`);
  },

  async createPromise(invoiceId: string, data: PromiseCreate): Promise<PaymentPromise> {
    if (isDemoMode) {
      return mockStore.createPromise(invoiceId, data);
    }
    return apiClient<PaymentPromise>(`/collections/invoices/${invoiceId}/promises`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async cancelPromise(
    promiseId: string,
    data?: { cancellation_reason?: string } | PromiseCancel
  ): Promise<PaymentPromise> {
    if (isDemoMode) {
      return mockStore.cancelPromise(promiseId, data);
    }
    return apiClient<PaymentPromise>(`/collections/promises/${promiseId}/cancel`, {
      method: "POST",
      body: JSON.stringify({
        cancellation_reason: data?.cancellation_reason || "Cancelled by collector",
      }),
    });
  },

  async markPromiseFulfilled(promiseId: string): Promise<PaymentPromise> {
    if (isDemoMode) {
      return mockStore.markPromiseFulfilled(promiseId);
    }
    return apiClient<PaymentPromise>(`/collections/promises/${promiseId}/mark-fulfilled`, {
      method: "POST",
    });
  },

  async markPromiseMissed(promiseId: string): Promise<PaymentPromise> {
    if (isDemoMode) {
      return mockStore.markPromiseMissed(promiseId);
    }
    return apiClient<PaymentPromise>(`/collections/promises/${promiseId}/mark-missed`, {
      method: "POST",
    });
  },

  async listAllDisputes(): Promise<Dispute[]> {
    if (isDemoMode) {
      return mockStore.listAllDisputes();
    }
    return apiClient<Dispute[]>("/collections/disputes");
  },

  async getDisputes(invoiceId: string): Promise<Dispute[]> {
    if (isDemoMode) {
      return mockStore.getDisputes(invoiceId);
    }
    return apiClient<Dispute[]>(`/collections/invoices/${invoiceId}/disputes`);
  },

  async createDispute(invoiceId: string, data: DisputeCreate): Promise<Dispute> {
    if (isDemoMode) {
      return mockStore.createDispute(invoiceId, data);
    }
    return apiClient<Dispute>(`/collections/invoices/${invoiceId}/disputes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async startDisputeReview(disputeId: string): Promise<Dispute> {
    if (isDemoMode) {
      return mockStore.startDisputeReview(disputeId);
    }
    return apiClient<Dispute>(`/collections/disputes/${disputeId}/start-review`, {
      method: "POST",
    });
  },

  async resolveDispute(
    disputeId: string,
    data: { resolution_notes: string } | DisputeResolve
  ): Promise<Dispute> {
    if (isDemoMode) {
      return mockStore.resolveDispute(disputeId, data);
    }
    return apiClient<Dispute>(`/collections/disputes/${disputeId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution_notes: data.resolution_notes }),
    });
  },

  async rejectDispute(
    disputeId: string,
    data: { rejection_reason: string } | DisputeReject
  ): Promise<Dispute> {
    if (isDemoMode) {
      return mockStore.rejectDispute(disputeId, data);
    }
    return apiClient<Dispute>(`/collections/disputes/${disputeId}/reject`, {
      method: "POST",
      body: JSON.stringify({ rejection_reason: data.rejection_reason }),
    });
  },
};

