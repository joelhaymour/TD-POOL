import { getLocalStore } from "@/lib/store/local-store";
import type { Store } from "@/lib/store/types";

/**
 * Phase 1 store factory.
 * Always returns the local file store unless USE_SUPABASE=true (stubbed).
 */
export function getStore(): Store {
  if (process.env.USE_SUPABASE === "true") {
    // Supabase-backed store lands in a later phase.
    return getLocalStore();
  }
  return getLocalStore();
}

export type { Store } from "@/lib/store/types";
export { StoreError } from "@/lib/store/types";
