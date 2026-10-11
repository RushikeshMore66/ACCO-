"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers.api";
import { Customer, CustomerCreate, CustomerUpdate } from "@/types/customer";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AlertCircle } from "lucide-react";
import { useDemoMode } from "@/providers/DemoModeProvider";

interface CustomerFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null; // If provided, edit mode. If null/undefined, create mode.
  onSuccess?: (customer: Customer) => void;
}

export function CustomerFormDialog({
  isOpen,
  onClose,
  customer,
  onSuccess,
}: CustomerFormDialogProps) {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoMode();
  const isEdit = Boolean(customer);

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [taxIdentifier, setTaxIdentifier] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Errors state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Pre-fill form on open/customer change
  useEffect(() => {
    if (customer) {
      setName(customer.name || "");
      setContactName(customer.contact_name || "");
      setEmail(customer.email || "");
      setPhone(customer.phone || "");
      setTaxIdentifier(customer.tax_identifier || "");
      setBillingAddress(customer.billing_address || "");
      setIsActive(customer.is_active ?? true);
    } else {
      setName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setTaxIdentifier("");
      setBillingAddress("");
      setIsActive(true);
    }
    setFieldErrors({});
    setServerError(null);
  }, [customer, isOpen]);

  // Validation function
  const validate = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) {
      errors.name = "Customer name is required.";
    } else if (name.trim().length > 255) {
      errors.name = "Customer name cannot exceed 255 characters.";
    }

    if (contactName.trim().length > 255) {
      errors.contactName = "Contact name cannot exceed 255 characters.";
    }

    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        errors.email = "Please enter a valid email address.";
      } else if (email.trim().length > 255) {
        errors.email = "Email cannot exceed 255 characters.";
      }
    }

    if (phone.trim().length > 255) {
      errors.phone = "Phone number cannot exceed 255 characters.";
    }

    if (taxIdentifier.trim().length > 255) {
      errors.taxIdentifier = "Tax identifier cannot exceed 255 characters.";
    }

    if (billingAddress.trim().length > 1024) {
      errors.billingAddress = "Billing address cannot exceed 1024 characters.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const createMutation = useMutation({
    mutationFn: (data: CustomerCreate) => customersApi.create(data),
    onSuccess: (newCust) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onSuccess?.(newCust);
      onClose();
    },
    onError: (err: any) => {
      const message = err?.message || "Failed to create customer. Please check the details.";
      setServerError(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CustomerUpdate }) =>
      customersApi.update(id, data),
    onSuccess: (updatedCust) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", updatedCust.id] });
      onSuccess?.(updatedCust);
      onClose();
    },
    onError: (err: any) => {
      const message = err?.message || "Failed to update customer. Please check the details.";
      setServerError(message);
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) {
      return;
    }

    if (isEdit && customer) {
      const updatePayload: CustomerUpdate = {
        name: name.trim(),
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        tax_identifier: taxIdentifier.trim() || null,
        billing_address: billingAddress.trim() || null,
        is_active: isActive,
      };
      updateMutation.mutate({ id: customer.id, data: updatePayload });
    } else {
      const createPayload: CustomerCreate = {
        name: name.trim(),
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        tax_identifier: taxIdentifier.trim() || null,
        billing_address: billingAddress.trim() || null,
      };
      createMutation.mutate(createPayload);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={
          isEdit
            ? `Edit Customer: ${customer?.name ?? ""}`
            : "Create New Customer"
        }
        description={
          isEdit
            ? "Update customer identity, billing address, and active status."
            : "Add a customer organization to manage AR exposure and invoices."
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Demo mode advisory notice */}
          {isDemoMode && (
            <div className="bg-brand-lavender/50 border border-brand/20 rounded-md p-2.5 text-xs text-brand">
              <strong>Demo Mode Notice:</strong> Customer records will be saved to your isolated demo workspace.
            </div>
          )}

          {/* Server-side Error Display */}
          {serverError && (
            <div
              role="alert"
              className="bg-status-error-bg border border-status-error/30 rounded-md p-3 text-sm text-status-error flex items-start gap-2"
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Name Field */}
          <Input
            label="Customer / Company Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Corporation"
            error={fieldErrors.name}
            disabled={isPending}
            autoFocus
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contact Person */}
            <Input
              label="Contact Person"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. John Doe"
              error={fieldErrors.contactName}
              disabled={isPending}
            />

            {/* Email */}
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. billing@acme.com"
              error={fieldErrors.email}
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Phone */}
            <Input
              label="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              error={fieldErrors.phone}
              disabled={isPending}
            />

            {/* Tax Identifier */}
            <Input
              label="Tax Identifier (TID / GSTIN)"
              value={taxIdentifier}
              onChange={(e) => setTaxIdentifier(e.target.value)}
              placeholder="e.g. 29ABCDE1234F1Z5"
              error={fieldErrors.taxIdentifier}
              disabled={isPending}
            />
          </div>

          {/* Billing Address */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="billing-address"
              className="text-sm font-medium text-text-primary"
            >
              Billing Address
            </label>
            <textarea
              id="billing-address"
              rows={3}
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              placeholder="e.g. 100 Main Street, Cyber City, Bengaluru, KA 560001"
              disabled={isPending}
              className="w-full rounded-lg border border-surface-border bg-white p-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand hover:border-text-muted resize-none"
            />
            {fieldErrors.billingAddress && (
              <p role="alert" className="text-xs text-status-error">
                {fieldErrors.billingAddress}
              </p>
            )}
          </div>

          {/* Active Status Toggle (Edit Mode Only) */}
          {isEdit && (
            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="is-active-toggle"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4 rounded border-surface-border text-brand focus:ring-brand cursor-pointer"
              />
              <label
                htmlFor="is-active-toggle"
                className="text-sm font-medium text-text-primary cursor-pointer select-none"
              >
                Customer is Active (allow invoice generation and collections workflows)
              </label>
            </div>
          )}

          <DialogFooter className="mt-6 -mx-6 -mb-5">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isPending}
              disabled={isPending}
            >
              {isEdit ? "Save Changes" : "Create Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
