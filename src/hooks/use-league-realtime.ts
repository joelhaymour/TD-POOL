"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Subscribes to postgres_changes on `picks` when Supabase public env is set.
 * No-ops (connected=false) when Supabase is not configured.
 */
export function useLeagueRealtime(
  leagueId: string | null | undefined,
  onInvalidate?: () => void,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || !leagueId) {
      setConnected(false);
      return;
    }

    const client = createBrowserClient(url, key);
    const channel = client
      .channel(`picks:league:${leagueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "picks",
          filter: `league_id=eq.${leagueId}`,
        },
        () => {
          onInvalidate?.();
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      setConnected(false);
      void client.removeChannel(channel);
    };
  }, [leagueId, onInvalidate]);

  return { connected };
}
