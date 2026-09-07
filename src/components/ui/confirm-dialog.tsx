"use client";

import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description}>
      <div className="flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
        <Button
          variant={danger ? "danger" : "primary"}
          fullWidth
          size="lg"
          disabled={loading}
          onClick={() => void onConfirm()}
        >
          {loading ? "Working…" : confirmLabel}
        </Button>
        <Button
          variant="secondary"
          fullWidth
          size="lg"
          disabled={loading}
          onClick={onClose}
        >
          {cancelLabel}
        </Button>
      </div>
    </Sheet>
  );
}
