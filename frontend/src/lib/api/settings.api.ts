import {
  CollectionPolicy,
  CollectionPolicyUpdate,
  OrganizationProfile,
  OrganizationSettingsUpdate,
  AppNotification,
  AuditEvent,
} from "@/types/collections";
import { apiClient, isDemoMode } from "./client";
import { mockStore } from "../mock/mock-store";

/**
 * Settings, Policies, Notifications, and Audit History API client.
 *
 * BACKEND CAPABILITY STATUS:
 * - Collection Policy: Authenticated endpoints exist on the backend at `/collections/policy` (GET, PUT).
 * - Organization Profile: Backend router `/organizations` is a minimal placeholder without active endpoints.
 * - Global Notifications: No backend notification endpoint exists; live notification service is unavailable.
 * - Global Activity/Audit Log: No backend global audit endpoint exists (backend only logs per-invoice timeline).
 *
 * DEMO / LIVE ISOLATION:
 * - In Demo Mode (`useDemo: true`), operations read/write to isolated in-memory `mockStore`.
 * - In Live Mode, operations connect strictly to authenticated API endpoints.
 * - If a live call fails, it never falls back silently to mock data.
 * - Unsupported operations in live mode throw informative errors or surface unavailable states.
 */
export const settingsApi = {
  // --- Collection Policy (Live Supported on Backend) ---
  async getCollectionPolicy(useDemo: boolean = isDemoMode): Promise<CollectionPolicy> {
    if (useDemo) {
      return mockStore.getCollectionPolicy();
    }
    return apiClient<CollectionPolicy>("/collections/policy");
  },

  async updateCollectionPolicy(
    data: CollectionPolicyUpdate,
    useDemo: boolean = isDemoMode
  ): Promise<CollectionPolicy> {
    if (useDemo) {
      return mockStore.updateCollectionPolicy(data);
    }
    return apiClient<CollectionPolicy>("/collections/policy", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  // --- Organization Profile (Backend Placeholder) ---
  async getOrganizationProfile(useDemo: boolean = isDemoMode): Promise<OrganizationProfile> {
    if (useDemo) {
      return mockStore.getOrganizationProfile();
    }
    // Organization endpoint is placeholder on backend; live call surfaces unsupported status
    return apiClient<OrganizationProfile>("/organizations");
  },

  async updateOrganizationProfile(
    data: OrganizationSettingsUpdate,
    useDemo: boolean = isDemoMode
  ): Promise<OrganizationProfile> {
    if (useDemo) {
      return mockStore.updateOrganizationProfile(data);
    }
    return apiClient<OrganizationProfile>("/organizations", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  // --- Global Notifications (Demo Only / Live Unavailable) ---
  async listNotifications(useDemo: boolean = isDemoMode): Promise<AppNotification[]> {
    if (useDemo) {
      return mockStore.listNotifications();
    }
    // Live notification API is not supported on backend
    throw new Error("Live notification service is not yet available on the backend.");
  },

  async markNotificationRead(
    id: string,
    useDemo: boolean = isDemoMode
  ): Promise<AppNotification[]> {
    if (useDemo) {
      return mockStore.markNotificationRead(id);
    }
    throw new Error("Live notification service is not yet available on the backend.");
  },

  async markAllNotificationsRead(
    useDemo: boolean = isDemoMode
  ): Promise<AppNotification[]> {
    if (useDemo) {
      return mockStore.markAllNotificationsRead();
    }
    throw new Error("Live notification service is not yet available on the backend.");
  },

  // --- Global Activity & Audit Log (Demo Only / Live Unavailable) ---
  async listAuditEvents(
    params?: { event_type?: string; actor?: string },
    useDemo: boolean = isDemoMode
  ): Promise<AuditEvent[]> {
    if (useDemo) {
      return mockStore.listAuditEvents(params);
    }
    // Live global audit API is not supported on backend
    throw new Error("Live organization-wide audit log endpoint is not yet implemented.");
  },
};
