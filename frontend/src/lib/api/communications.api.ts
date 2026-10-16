import { CollectionMessage, MessageCreate, TimelineEvent } from "@/types/collection_messages";
import { CustomerReplyAnalysis, ReplyAnalysisReviewRequest } from "@/types/reply_analysis";
import { apiClient, isDemoMode } from "./client";
import { mockStore } from "../mock/mock-store";

export const communicationsApi = {
  async listAllMessages(): Promise<CollectionMessage[]> {
    if (isDemoMode) {
      return mockStore.listAllMessages();
    }
    return apiClient<CollectionMessage[]>("/collections/messages");
  },

  async getMessagesByInvoice(invoiceId: string): Promise<CollectionMessage[]> {
    if (isDemoMode) {
      return mockStore.getMessagesByInvoice(invoiceId);
    }
    return apiClient<CollectionMessage[]>(`/collections/invoices/${invoiceId}/messages`);
  },

  async recordInbound(invoiceId: string, data: MessageCreate): Promise<CollectionMessage> {
    if (isDemoMode) {
      return mockStore.recordInbound(invoiceId, data);
    }
    return apiClient<CollectionMessage>(`/collections/invoices/${invoiceId}/inbound-messages`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getTimeline(invoiceId: string): Promise<TimelineEvent[]> {
    if (isDemoMode) {
      return mockStore.getTimeline(invoiceId);
    }
    return apiClient<TimelineEvent[]>(`/collections/invoices/${invoiceId}/timeline`);
  },

  // Analyses
  async analyzeMessage(messageId: string): Promise<CustomerReplyAnalysis> {
    if (isDemoMode) {
      return mockStore.analyzeMessage(messageId);
    }
    return apiClient<CustomerReplyAnalysis>(`/collections/messages/${messageId}/analyze`, {
      method: "POST",
    });
  },

  async getAnalyses(messageId: string): Promise<CustomerReplyAnalysis[]> {
    if (isDemoMode) {
      return mockStore.getAnalyses(messageId);
    }
    return apiClient<CustomerReplyAnalysis[]>(`/collections/messages/${messageId}/analyses`);
  },

  async reviewAnalysis(analysisId: string, req: ReplyAnalysisReviewRequest): Promise<CustomerReplyAnalysis> {
    if (isDemoMode) {
      return mockStore.reviewAnalysis(analysisId, req);
    }
    return apiClient<CustomerReplyAnalysis>(`/collections/reply-analyses/${analysisId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision: req.status, review_notes: req.notes }),
    });
  },

  // Demo-only analyses listing
  async listAllAnalyses(): Promise<CustomerReplyAnalysis[]> {
    if (isDemoMode) {
      return mockStore.listAllAnalyses();
    }
    throw new Error("Global analysis listing is not supported in live mode.");
  }
};
