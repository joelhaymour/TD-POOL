"use client";

import {
  useEffect,
  useId,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Show drag handle + close button (default true) */
  showHeader?: boolean;
};

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  className,
  showHeader = true,
}: SheetProps) {
  const titleId = useId();
  // Rendered into <body>: a sheet opened from inside a card must not be
  // positioned or clipped by that card. <body> exists only after hydration.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close sheet"
        className="absolute inset-0 touch-none bg-scrim animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          // dvh, not vh: the on-screen keyboard shrinks the viewport on phones.
          "relative z-10 flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-raised pb-[env(safe-area-inset-bottom)] shadow-card sm:rounded-2xl",
          "animate-sheet-up",
          className,
        )}
      >
        {showHeader && (
          <div className="shrink-0 border-b border-border px-4 pb-3 pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {title ? (
                  <h2
                    id={titleId}
                    className="font-display text-xl font-bold uppercase tracking-wide text-ink"
                  >
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={onClose}
                className="-mr-1 -mt-1"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const noop = () => () => {};
