"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Full-screen picture viewer. The whole picture fits the screen by default;
 * tapping it switches to full width so a long slip can be scrolled and read.
 * Close with the X, the backdrop, or Escape. Rendered into <body> so no
 * parent can clip or offset it.
 */
export function PhotoViewer({
  open,
  src,
  alt,
  title,
  onClose,
}: {
  open: boolean;
  src: string | null;
  alt: string;
  title?: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  // The portal needs <body>, which only exists after hydration.
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

  if (!open || !src || !mounted) return null;

  function close() {
    setZoomed(false);
    onClose();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? alt}
      className="fixed inset-0 z-[80] flex flex-col bg-black/95 animate-fade-in"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="min-w-0 truncate font-display text-base font-bold uppercase tracking-wide text-white">
          {title}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            aria-label={zoomed ? "Fit to screen" : "Zoom in"}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-95"
          >
            {zoomed ? <Minus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition active:scale-95"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          zoomed ? "overflow-auto overscroll-contain" : "flex items-center justify-center",
        )}
        onClick={(e) => {
          // Only the empty space around the picture closes it.
          if (e.target === e.currentTarget) close();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onClick={() => setZoomed((z) => !z)}
          className={cn(
            "select-none rounded-lg",
            zoomed ? "mx-auto h-auto w-full max-w-none" : "max-h-full max-w-full object-contain",
          )}
        />
      </div>

      {!zoomed ? (
        <p className="shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-[11px] text-white/50">
          Tap the picture to zoom
        </p>
      ) : null}
    </div>,
    document.body,
  );
}

const noop = () => () => {};
