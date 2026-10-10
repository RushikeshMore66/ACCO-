"use client";

import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogFooter,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useState } from "react";

interface ConfirmDialogProps {
  /** The element that opens the dialog */
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "primary";
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * ConfirmDialog requires an explicit user confirmation before
 * performing destructive or financial-state-changing actions.
 * Prevents accidental double-submissions via loading state.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  isLoading: externalLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isLoading = externalLoading || loading;

  async function handleConfirm() {
    if (isLoading) return;
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isLoading && setOpen(v)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} size="sm">
        <div className="flex gap-3">
          <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-status-error-bg">
            <AlertTriangle size={18} className="text-status-error" />
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            {description}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            size="sm"
            isLoading={isLoading}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
