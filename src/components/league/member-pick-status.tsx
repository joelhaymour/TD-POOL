"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, ChevronDown } from "lucide-react";
import { ReactionButtons } from "@/components/social/reaction-buttons";
import { useToast } from "@/components/ui/toast";
import { apiError, apiJson } from "@/lib/api/client";
import type { ReactionSummary } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { MemberChip, ResultMark } from "@/components/ui/result-mark";

export type MemberPickRow = {
  memberId: string;
  memberName: string;
  /** The pick row's id, for thumbs up/down. */
  pickId?: string | null;
  playerId?: string | null;
  playerName?: string | null;
  playerHref?: string | null;
  result?: "pending" | "td" | "no_td" | "game_not_finished";
};

export type MemberPickStatusProps = {
  members: MemberPickRow[];
  defaultOpen?: boolean;
  className?: string;
  /** The viewer's own row, marked so they can find themselves in a long list. */
  highlightMemberId?: string;
  /** Turns on thumbs and the ping button. */
  slug?: string;
};

const NO_REACTIONS: ReactionSummary = { up: 0, down: 0, mine: 0 };

export function MemberPickStatus({
  members,
  defaultOpen = false,
  className,
  highlightMemberId,
  slug,
}: MemberPickStatusProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { toast } = useToast();
  const submitted = members.filter((m) => Boolean(m.playerName)).length;
  const missing = members.filter((m) => !m.playerName && m.memberId !== highlightMemberId).length;
  const [pinging, setPinging] = useState(false);

  // Thumbs for every pick on the list, fetched once the picks are known.
  const pickIds = members.map((m) => m.pickId).filter((id): id is string => Boolean(id));
  const pickKey = pickIds.join(",");
  const [reactions, setReactions] = useState<Record<string, ReactionSummary>>({});
  useEffect(() => {
    if (!slug || !pickKey) return;
    let cancelled = false;
    void apiJson<{ picks: Record<string, ReactionSummary> }>(
      `/api/leagues/${slug}/reactions?picks=${pickKey}`,
    ).then((r) => {
      if (!cancelled && r.ok) setReactions(r.data.picks);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, pickKey]);

  const vote = useCallback(
    async (pickId: string, value: -1 | 0 | 1) => {
      const r = await apiJson<{ reactions: ReactionSummary }>(`/api/leagues/${slug}/reactions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "pick", targetId: pickId, value }),
      });
      if (!r.ok) {
        toast({ title: "Couldn't save that", description: apiError(r), tone: "error" });
        return null;
      }
      setReactions((cur) => ({ ...cur, [pickId]: r.data.reactions }));
      return r.data.reactions;
    },
    [slug, toast],
  );

  async function ping() {
    if (!slug) return;
    setPinging(true);
    const r = await apiJson<{ missing: number; sent: number }>(`/api/leagues/${slug}/pool/ping`, {
      method: "POST",
    });
    setPinging(false);
    if (!r.ok) {
      toast({ title: "Couldn't ping", description: apiError(r), tone: "error" });
      return;
    }
    toast(
      r.data.sent > 0
        ? { title: `Pinged ${r.data.sent}`, description: "They'll get a nudge to make their pick.", tone: "success" }
        : { title: "Already pinged", description: "Everyone missing a pick was nudged in the last few hours." },
    );
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.4rem] bg-chalk shadow-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <h2 className="text-[15px] font-semibold text-ink">
            Member picks{" "}
            <span className="font-normal text-ink-muted">
              · {submitted} of {members.length} in
            </span>
          </h2>
        </button>
        {slug && missing > 0 ? (
          <button
            type="button"
            disabled={pinging}
            onClick={() => void ping()}
            className="pressable flex h-8 items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 text-xs font-semibold text-ink disabled:opacity-60"
          >
            <BellRing className="h-3.5 w-3.5" aria-hidden />
            {pinging ? "Pinging…" : `Ping ${missing}`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Hide member picks" : "Show member picks"}
          className="-mr-1 p-1"
        >
          <ChevronDown
            className={cn(
              "h-5 w-5 text-ink-faint transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      {open ? (
        <ul className="divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
          {members.map((m) => {
            const hasPick = Boolean(m.playerName);
            const isViewer = m.memberId === highlightMemberId;
            return (
              <li
                key={m.memberId}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 text-sm",
                  isViewer && "bg-ink/[0.025]",
                )}
              >
                <MemberChip name={m.memberName} />
                {hasPick ? <ResultMark result="won" className="h-3.5 w-3.5" /> : null}
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                  {m.memberName}
                  {isViewer ? (
                    <span className="ml-1.5 text-xs font-normal text-ink-faint">(you)</span>
                  ) : null}
                </span>
                <span className="text-ink-faint">—</span>
                {hasPick && m.playerHref ? (
                  <Link
                    href={m.playerHref}
                    className="max-w-[45%] truncate font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {m.playerName}
                  </Link>
                ) : hasPick ? (
                  <span className="max-w-[45%] truncate font-medium text-ink">
                    {m.playerName}
                  </span>
                ) : (
                  <span className="text-ink-faint">No pick yet</span>
                )}
                {slug && m.pickId ? (
                  <ReactionButtons
                    size="sm"
                    summary={reactions[m.pickId] ?? NO_REACTIONS}
                    onVote={(value) => vote(m.pickId!, value)}
                    disabled={isViewer}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
