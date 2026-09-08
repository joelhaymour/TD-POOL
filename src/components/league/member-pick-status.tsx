"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type MemberPickRow = {
  memberId: string;
  memberName: string;
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
};

export function MemberPickStatus({
  members,
  defaultOpen = true,
  className,
  highlightMemberId,
}: MemberPickStatusProps) {
  const [open, setOpen] = useState(defaultOpen);
  const submitted = members.filter((m) => Boolean(m.playerName)).length;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-chalk shadow-card",
        className,
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <h2 className="font-display text-base font-bold uppercase tracking-wide text-ink">
            Member Picks
          </h2>
          <p className="text-xs text-ink-muted">
            {submitted} of {members.length} in
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-ink-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <ul className="divide-y divide-border border-t border-border">
          {members.map((m) => {
            const hasPick = Boolean(m.playerName);
            const isViewer = m.memberId === highlightMemberId;
            return (
              <li
                key={m.memberId}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 text-sm",
                  isViewer && "bg-turf/5",
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {hasPick ? "✅" : "⏳"}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                  {m.memberName}
                  {isViewer ? (
                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-turf">
                      You
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-faint">—</span>
                {hasPick && m.playerHref ? (
                  <Link
                    href={m.playerHref}
                    className="max-w-[45%] truncate font-medium text-turf underline-offset-2 hover:underline"
                  >
                    {m.playerName}
                  </Link>
                ) : hasPick ? (
                  <span className="max-w-[45%] truncate font-medium text-ink">
                    {m.playerName}
                  </span>
                ) : (
                  <span className="text-ink-faint">Needs Pick</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
