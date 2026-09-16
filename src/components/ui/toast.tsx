"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ToastTone = "default" | "success" | "error";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastItem = ToastInput & { id: string };

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClasses: Record<ToastTone, string> = {
  default: "border-border-strong bg-raised text-ink",
  success: "border-lime/40 bg-raised text-ink",
  error: "border-danger/40 bg-raised text-ink",
};

const accentClasses: Record<ToastTone, string> = {
  default: "bg-lime",
  success: "bg-turf",
  error: "bg-danger",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const item: ToastItem = {
        ...input,
        id,
        tone: input.tone ?? "default",
        durationMs: input.durationMs ?? 3200,
      };
      setItems((prev) => [...prev, item]);
      window.setTimeout(() => dismiss(id), item.durationMs);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-lg items-stretch overflow-hidden rounded-xl border shadow-card animate-toast-in",
              toneClasses[item.tone ?? "default"],
            )}
          >
            <div
              className={cn("w-1 shrink-0", accentClasses[item.tone ?? "default"])}
            />
            <div className="min-w-0 flex-1 px-3 py-2.5">
              <p className="text-sm font-semibold">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-xs text-ink-muted">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              className="px-3 text-ink-faint hover:text-ink"
              onClick={() => dismiss(item.id)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
