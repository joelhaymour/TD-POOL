"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";

export type LeagueListItem = {
  id: string;
  slug: string;
  name: string;
  /** "TD Pool · Tickets", or "Open on the website" when the app hides them all. */
  sections: string;
  memberCount: number;
  isAdmin: boolean;
};

/** Past this many leagues a search box earns its space. */
const SEARCH_AT = 7;

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Every league the member is in, as one grouped list: compact rows, not cards. */
export function LeagueList({ leagues }: { leagues: LeagueListItem[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? leagues.filter((l) => l.name.toLowerCase().includes(q)) : leagues;
  }, [leagues, query]);

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-ink-muted">
          Your leagues
        </h2>
        <span className="text-xs text-ink-faint">{leagues.length}</span>
      </div>

      {leagues.length >= SEARCH_AT ? (
        <label className="relative mb-2 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <span className="sr-only">Find a league</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a league"
            className="h-11 w-full rounded-xl border border-border bg-chalk pl-9 pr-3 text-sm text-ink outline-none focus:border-turf"
          />
        </label>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-chalk shadow-card">
        {shown.map((league) => (
          <li key={league.id}>
            <Link
              href={`/${league.slug}`}
              className="flex items-center gap-3 px-3.5 py-3 transition active:bg-field-deep"
            >
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-field-deep font-display text-sm font-extrabold text-ink"
              >
                {initials(league.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base font-bold uppercase leading-tight tracking-wide text-ink">
                  {league.name}
                </span>
                <span className="block truncate text-xs text-ink-muted">
                  {league.sections} · {league.memberCount}{" "}
                  {league.memberCount === 1 ? "member" : "members"}
                  {league.isAdmin ? " · admin" : ""}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            </Link>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-ink-muted">No league matches “{query}”.</li>
        ) : null}
      </ul>
    </section>
  );
}
