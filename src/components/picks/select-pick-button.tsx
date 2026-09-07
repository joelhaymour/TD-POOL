"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils/cn";

export type SelectPickButtonProps = {
  playerName: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function SelectPickButton({
  playerName,
  onConfirm,
  disabled,
  label = "Select Player",
  size = "sm",
  className,
}: SelectPickButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="primary"
        size={size}
        disabled={disabled || loading}
        className={cn(className)}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => {
          if (!loading) setOpen(false);
        }}
        onConfirm={handleConfirm}
        loading={loading}
        title="Confirm pick"
        description={`Select ${playerName} as your Anytime TD for this week? This locks the player for everyone else.`}
        confirmLabel="Lock in pick"
        cancelLabel="Keep looking"
      />
    </>
  );
}
