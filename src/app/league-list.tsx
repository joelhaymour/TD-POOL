"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, Pin, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { tap } from "@/lib/native/haptics";
import { apiError, apiJson } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

export type LeagueListItem = {
  id: string;
  slug: string;
  name: string;
  /** "TD Pool · Tickets", or "Open on the website" when the app hides them all. */
  sections: string;
  memberCount: number;
  isAdmin: boolean;
  /** When the member pinned it; pinned leagues sit on top, newest pin first. */
  pinnedAt: string | null;
};

/** Past this many leagues a search box earns its space. */
const SEARCH_AT = 7;

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Each league keeps its own tile colour, so a long list is easy to scan. */
const TILES = [
  "bg-[#dcefe1] text-[#0d6a31]",
  "bg-[#f6e7c9] text-[#8a5a08]",
  "bg-[#dde8f6] text-[#24518c]",
  "bg-[#f4dede] text-[#9a2f2f]",
  "bg-[#e6e0f4] text-[#54408f]",
  "bg-[#d9eeec] text-[#1f6b64]",
];

function tileFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TILES[Math.abs(hash) % TILES.length];
}

function LeagueRow({
  league,
  onPin,
  busy,
}: {
  league: LeagueListItem;
  onPin: (league: LeagueListItem) => void;
  busy: boolean;
}) {
  const pinned = Boolean(league.pinnedAt);
  return (
    <li className="flex items-center">
      <Link
        href={`/${league.slug}`}
        onClick={() => tap()}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 transition-colors active:bg-ink/[0.04]"
      >
        <span
          aria-hidden
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.85rem] font-display text-[15px] font-extrabold",
            tileFor(league.id),
          )}
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
      </Link>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          tap();
          onPin(league);
        }}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${league.name}` : `Pin ${league.name}`}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center transition active:scale-90 disabled:opacity-50",
          pinned ? "text-turf" : "text-ink-faint",
        )}
      >
        <Pin className={cn("h-4 w-4", pinned && "fill-current")} aria-hidden />
      </button>
      <Link href={`/${league.slug}`} aria-hidden tabIndex={-1} className="pr-3.5">
        <ChevronRight className="h-4 w-4 text-ink-faint" />
      </Link>
    </li>
  );
}

function Group({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-ink-muted">{title}</h2>
        {count != null ? <span className="text-xs text-ink-faint">{count}</span> : null}
      </div>
      <ul className="divide-y divide-ink/[0.06] overflow-hidden rounded-[1.4rem] bg-white/75 shadow-[var(--glass-shadow)] backdrop-blur-xl">
        {children}
      </ul>
    </section>
  );
}

/**
 * Every league the member is in: pinned ones first, then the rest, as grouped
 * lists of compact rows. A search box appears once the list gets long.
 */
export function LeagueList({ leagues: initial }: { leagues: LeagueListItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [leagues, setLeagues] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setLeagues(initial);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const { pinned, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q ? leagues.filter((l) => l.name.toLowerCase().includes(q)) : leagues;
    return {
      pinned: shown
        .filter((l) => l.pinnedAt)
        .sort((a, b) => Date.parse(b.pinnedAt!) - Date.parse(a.pinnedAt!)),
      rest: shown.filter((l) => !l.pinnedAt).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [leagues, query]);

  async function togglePin(league: LeagueListItem) {
    const pin = !league.pinnedAt;
    setBusy(league.id);
    setLeagues((cur) =>
      cur.map((l) => (l.id === league.id ? { ...l, pinnedAt: pin ? new Date().toISOString() : null } : l)),
    );
    const r = await apiJson(`/api/leagues/${league.slug}/pin`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: pin }),
    });
    setBusy(null);
    if (!r.ok) {
      setLeagues((cur) => cur.map((l) => (l.id === league.id ? league : l)));
      toast({ title: "Couldn't pin that", description: apiError(r), tone: "error" });
      return;
    }
    router.refresh();
  }

  const row = (l: LeagueListItem) => (
    <LeagueRow key={l.id} league={l} onPin={(x) => void togglePin(x)} busy={busy === l.id} />
  );

  return (
    <>
      {leagues.length >= SEARCH_AT ? (
        <label className="relative mt-5 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <span className="sr-only">Find a league</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a league"
            className="h-11 w-full rounded-full bg-ink/[0.06] pl-9 pr-4 text-sm text-ink outline-none transition focus:bg-white focus:shadow-[0_0_0_2px_rgba(17,128,60,0.35)]"
          />
        </label>
      ) : null}
      {pinned.length > 0 ? <Group title="Pinned">{pinned.map(row)}</Group> : null}
      {rest.length > 0 ? (
        <Group title={pinned.length > 0 ? "Other leagues" : "Your leagues"} count={rest.length}>
          {rest.map(row)}
        </Group>
      ) : null}
      {pinned.length + rest.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-ink-muted">
          No league matches “{query}”.
        </p>
      ) : null}
      {leagues.length > 1 && pinned.length === 0 && !query ? (
        <p className="mt-2 text-center text-[11px] text-ink-faint">
          Tap the pin on a league to keep it at the top.
        </p>
      ) : null}
    </>
  );
}
