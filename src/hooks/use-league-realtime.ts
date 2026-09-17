"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const PICKS_ONLY = ["picks"] as const;

/** Every table a parlay screen (group or tickets) needs to hear about. */
export const PARLAY_TABLES = [
  "parlays",
  "parlay_legs",
  "parlay_share_links",
  "parlay_rides",
] as const;

/**
 * Subscribes to postgres_changes on league-scoped tables (default `picks`)
 * when Supabase public env is set. No-ops (connected=false) otherwise.
 * Deletes are not delivered through a filtered subscription, so callers keep
 * a polling fallback.
 */
export function useLeagueRealtime(
  leagueId: string | null | undefined,
  onInvalidate?: () => void,
  tables: readonly string[] = PICKS_ONLY,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const tableKey = tables.join(",");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || !leagueId) {
      return;
    }

    const client = createBrowserClient(url, key);
    let channel = client.channel(`league:${leagueId}:${tableKey}`);
    for (const table of tableKey.split(",")) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `league_id=eq.${leagueId}`,
        },
        () => {
          onInvalidate?.();
        },
      );
    }
    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
    });

    return () => {
      setConnected(false);
      void client.removeChannel(channel);
    };
  }, [leagueId, onInvalidate, tableKey]);

  return {
    connected: Boolean(
      connected && leagueId && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}
