import { Customer, CustomerCreate, CustomerUpdate } from "@/types/customer";
import { apiClient, isDemoMode } from "./client";
import { mockStore } from "../mock/mock-store";

export const customersApi = {
  async list(params?: {
    name?: string;
    email?: string;
    include_inactive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Customer[]> {
    if (isDemoMode) {
      return mockStore.listCustomers(params);
    }
    const searchParams = new URLSearchParams();
    if (params?.name) searchParams.set("name", params.name);
    if (params?.email) searchParams.set("email", params.email);
    if (params?.include_inactive) searchParams.set("include_inactive", "true");
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    
    const query = searchParams.toString();
    return apiClient<Customer[]>(`/customers${query ? `?${query}` : ""}`);
  },

  async get(id: string): Promise<Customer> {
    if (isDemoMode) {
      const customer = await mockStore.getCustomer(id);
      if (!customer) throw new Error("Not found");
      return customer;
    }
    return apiClient<Customer>(`/customers/${id}`);
  },

  async create(data: CustomerCreate): Promise<Customer> {
    if (isDemoMode) {
      return mockStore.createCustomer(data);
    }
    return apiClient<Customer>("/customers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: CustomerUpdate): Promise<Customer> {
    if (isDemoMode) {
      return mockStore.updateCustomer(id, data);
    }
    return apiClient<Customer>(`/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
};
