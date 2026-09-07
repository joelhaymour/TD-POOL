import { getLocalStore } from "@/lib/store/local-store";
import { getSupabaseStore } from "@/lib/store/supabase-store";
import type { Store } from "@/lib/store/types";

/**
 * Store factory.
 * USE_SUPABASE=true → Supabase-backed store; otherwise local JSON file store.
 */
export function getStore(): Store {
  if (process.env.USE_SUPABASE === "true") {
    return getSupabaseStore();
  }
  return getLocalStore();
}

export type { Store } from "@/lib/store/types";
export { StoreError } from "@/lib/store/types";
