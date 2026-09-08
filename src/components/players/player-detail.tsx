import { cn } from "@/lib/utils/cn";
import { formatAmerican } from "@/lib/utils/odds";
import { Badge, type BadgeStatus } from "@/components/ui/badge";
import { StarRating } from "@/components/ui/star-rating";
import { SelectPickButton } from "@/components/picks/select-pick-button";
import { Button } from "@/components/ui/button";
import type { ResearchGameLog, ResearchHistory } from "@/lib/types";

export type SportsbookQuote = {
  book: string;
  americanOdds: number;
};

export type ResearchStat = {
  label: string;
  value: string | number;
};

export type PlayerDetailData = {
  id: string;
  name: string;
  team: string;
  teamFullName?: string;
  position: string;
  opponent: string;
  opponentFullName?: string;
  rank: number;
  ourProbability: number;
  marketProbability: number | null;
  americanOdds: number | null;
  consensusOdds?: number | null;
  bookOdds?: SportsbookQuote[];
  matchupStars: number;
  goalLineStars: number;
  availability: BadgeStatus;
  injuryNote?: string | null;
  takenByName?: string | null;
  limitedData?: boolean;

  overview?: {
    whyWeLike?: string[];
    concerns?: string[];
    verdict?: string;
  };
  history?: ResearchHistory;
  usage?: ResearchStat[];
  matchup?: ResearchStat[];
  gameEnvironment?: ResearchStat[];
  availabilityNotes?: string[];
  analysisNotes?: string[];
};

export type PlayerDetailProps = {
  player: PlayerDetailData;
  onSelect?: (playerId: string) => void | Promise<void>;
  selectDisabled?: boolean;
  className?: string;
};

function pct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "Unavailable";
  return `${Math.round(n * 100)}%`;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-chalk p-4 shadow-card">
      <h2 className="font-display text-base font-bold uppercase tracking-[0.1em] text-ink">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatGrid({ stats }: { stats?: ResearchStat[] }) {
  if (!stats || stats.length === 0) {
    return (
      <p className="text-sm text-ink-muted">No data available yet.</p>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-2">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl bg-field px-3 py-2.5">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
            {s.label}
          </dt>
          <dd className="mt-0.5 font-display text-lg font-bold text-ink">
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BulletList({ items, tone }: { items?: string[]; tone?: "good" | "bad" }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "flex gap-2 text-sm leading-snug",
            tone === "bad" ? "text-ink-muted" : "text-ink",
          )}
        >
          <span
            className={cn(
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
              tone === "bad" ? "bg-warning" : "bg-turf",
            )}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

const trendLabel = {
  up: "↑ Increasing",
  stable: "→ Stable",
  down: "↓ Decreasing",
} as const;

function GameLogTable({
  games,
  emptyLabel,
}: {
  games: ResearchGameLog[];
  emptyLabel: string;
}) {
  if (games.length === 0) {
    return <p className="text-sm text-ink-muted">{emptyLabel}</p>;
  }

  // Rushers and receivers get the columns that matter for their role; showing
  // both sets for everyone leaves half the table full of zeroes.
  const totalCarries = games.reduce((s, g) => s + g.carries, 0);
  const totalReceptions = games.reduce((s, g) => s + g.receptions, 0);
  const showRush = totalCarries > 0;
  const showRec = totalReceptions > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-field text-[10px] font-bold uppercase tracking-wider text-ink-faint">
          <tr>
            <th className="px-2 py-2 font-bold">Wk</th>
            <th className="px-2 py-2 font-bold">Opp</th>
            <th className="px-2 py-2 text-center font-bold">TD</th>
            <th className="px-2 py-2 text-center font-bold">RZ</th>
            {showRush ? (
              <>
                <th className="px-2 py-2 text-center font-bold">Car</th>
                <th className="px-2 py-2 text-center font-bold">Ru Yds</th>
              </>
            ) : null}
            {showRec ? (
              <>
                <th className="px-2 py-2 text-center font-bold">Rec</th>
                <th className="px-2 py-2 text-center font-bold">Re Yds</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {games.map((g) => (
            <tr key={`${g.week}-${g.opponent}-${g.home ? "h" : "a"}`}>
              <td className="px-2 py-2 font-medium text-ink-muted">{g.week}</td>
              <td className="px-2 py-2 font-semibold text-ink">
                {g.home ? "vs" : "@"} {g.opponent}
              </td>
              <td
                className={cn(
                  "px-2 py-2 text-center font-display text-base font-bold",
                  g.touchdowns > 0 ? "text-turf" : "text-ink-faint",
                )}
              >
                {g.touchdowns}
              </td>
              <td className="px-2 py-2 text-center font-medium text-ink">
                {g.rz_touches}
              </td>
              {showRush ? (
                <>
                  <td className="px-2 py-2 text-center font-medium text-ink">
                    {g.carries}
                  </td>
                  <td className="px-2 py-2 text-center font-medium text-ink">
                    {g.rush_yards}
                  </td>
                </>
              ) : null}
              {showRec ? (
                <>
                  <td className="px-2 py-2 text-center font-medium text-ink">
                    {g.receptions}
                  </td>
                  <td className="px-2 py-2 text-center font-medium text-ink">
                    {g.receiving_yards}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistorySection({
  history,
  opponent,
}: {
  history?: ResearchHistory;
  opponent: string;
}) {
  if (!history) {
    return (
      <Section title="History">
        <p className="text-sm text-ink-muted">Game history not available yet.</p>
      </Section>
    );
  }

  return (
    <Section title="History">
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
              Last 5 games
            </p>
            <p className="text-[11px] font-semibold text-ink-muted">
              {trendLabel[history.recent_trend]}
            </p>
          </div>
          <p className="mb-2 text-xs leading-snug text-ink-muted">
            {history.last_5_summary}
          </p>
          <GameLogTable
            games={history.last_5}
            emptyLabel="No recent games logged."
          />
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
            vs {opponent}
          </p>
          <p className="mb-2 text-xs leading-snug text-ink-muted">
            {history.vs_opponent_summary}
          </p>
          <GameLogTable
            games={history.vs_opponent}
            emptyLabel={`No recent meetings vs ${opponent}.`}
          />
        </div>
      </div>
    </Section>
  );
}

export function PlayerDetail({
  player,
  onSelect,
  selectDisabled,
  className,
}: PlayerDetailProps) {
  const taken = player.availability === "taken";
  const locked = player.availability === "locked";
  const canSelect =
    player.availability === "available" && !selectDisabled && Boolean(onSelect);

  return (
    <div className={cn("space-y-3 pb-6", className)}>
      <header className="rounded-2xl border border-border bg-chalk p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-turf">
              Player Research
            </p>
            <h1 className="font-display text-3xl font-extrabold uppercase leading-none tracking-wide text-ink">
              {player.name}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {player.teamFullName ?? player.team} — {player.position}
            </p>
            <p className="text-sm font-medium text-ink">
              vs {player.opponentFullName ?? player.opponent}
            </p>
          </div>
          <Badge status={player.availability} />
        </div>

        {/* Market % is gone: we have no source for real anytime-TD prices, and
            a generated one is worse than none. The odds box appears only when a
            sportsbook actually returned a quote. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-ink px-3 py-2.5 text-chalk">
            <p className="text-[10px] font-bold uppercase tracking-wider text-chalk/55">
              TD Pool Rank
            </p>
            <p className="font-display text-3xl font-extrabold text-lime">
              #{player.rank}
            </p>
          </div>
          <div className="rounded-xl bg-field px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
              TD Chance
            </p>
            <p className="font-display text-3xl font-extrabold text-ink">
              {pct(player.ourProbability)}
            </p>
          </div>
          {player.americanOdds != null ? (
            <div className="rounded-xl bg-field px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Anytime TD
              </p>
              <p className="font-display text-3xl font-extrabold text-turf">
                {formatAmerican(player.americanOdds)}
              </p>
            </div>
          ) : null}
        </div>

        {player.limitedData ? (
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-warning">
            Limited data — lower confidence estimate
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <StarRating value={player.matchupStars} label="Matchup" />
        </div>

        {player.injuryNote ? (
          <p className="mt-3 text-xs font-semibold text-warning">
            {player.injuryNote}
          </p>
        ) : null}

        <div className="mt-4">
          {taken ? (
            <Button variant="ghost" fullWidth disabled className="!opacity-100">
              Taken by {player.takenByName ?? "another member"}
            </Button>
          ) : locked ? (
            <Button variant="secondary" fullWidth disabled>
              Picks locked
            </Button>
          ) : canSelect ? (
            <SelectPickButton
              playerName={player.name}
              onConfirm={() => onSelect?.(player.id)}
              size="lg"
              className="w-full"
            />
          ) : null}
        </div>
      </header>

      <Section title="Overview">
        {player.overview?.verdict ? (
          <p className="mb-3 text-sm leading-relaxed text-ink">
            {player.overview.verdict}
          </p>
        ) : null}
        <div className="space-y-3">
          {player.overview?.whyWeLike?.length ? (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-turf">
                Why we like him
              </p>
              <BulletList items={player.overview.whyWeLike} />
            </div>
          ) : null}
          {player.overview?.concerns?.length ? (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-warning">
                Concerns
              </p>
              <BulletList items={player.overview.concerns} tone="bad" />
            </div>
          ) : (
            !player.overview?.whyWeLike?.length && (
              <p className="text-sm text-ink-muted">
                Research summary will appear here.
              </p>
            )
          )}
        </div>
      </Section>

      {/* Only rendered when a sportsbook actually returned quotes. */}
      {player.bookOdds && player.bookOdds.length > 0 ? (
        <Section title="Betting Market">
          <ul className="space-y-2">
            {player.bookOdds.map((q) => (
              <li
                key={q.book}
                className="flex items-center justify-between rounded-xl bg-field px-3 py-2 text-sm"
              >
                <span className="font-medium text-ink-muted">{q.book}</span>
                <span className="font-display text-lg font-bold text-ink">
                  {formatAmerican(q.americanOdds)}
                </span>
              </li>
            ))}
            {player.consensusOdds != null ? (
              <li className="flex items-center justify-between rounded-xl bg-ink px-3 py-2 text-sm">
                <span className="font-medium text-chalk/70">Consensus</span>
                <span className="font-display text-lg font-bold text-lime">
                  {formatAmerican(player.consensusOdds)}
                </span>
              </li>
            ) : null}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            Odds may change and are not guaranteed executable pricing.
          </p>
        </Section>
      ) : null}

      {player.usage?.length ? (
        <Section title="Scoring Opportunity">
          <StatGrid stats={player.usage} />
        </Section>
      ) : null}

      <HistorySection history={player.history} opponent={player.opponent} />

      <Section title="Matchup">
        <div className="mb-3">
          <StarRating value={player.matchupStars} size="lg" label="Matchup" showValue />
        </div>
        <StatGrid stats={player.matchup} />
      </Section>

      <Section title="Game Environment">
        <StatGrid stats={player.gameEnvironment} />
      </Section>

      <Section title="Availability">
        <div className="mb-2">
          <Badge status={player.availability === "available" ? "healthy" : player.availability} />
        </div>
        {player.availabilityNotes?.length ? (
          <BulletList items={player.availabilityNotes} />
        ) : (
          <p className="text-sm text-ink-muted">
            {player.injuryNote ?? "No injury flags currently tracked."}
          </p>
        )}
      </Section>

      <Section title="TD Pool Analysis">
        {player.analysisNotes?.length ? (
          <BulletList items={player.analysisNotes} />
        ) : (
          <p className="text-sm leading-relaxed text-ink-muted">
            Our ranking blends goal-line and red-zone usage, matchup, recent
            opportunity, and game environment. It is a decision-support
            estimate — not a guarantee.
          </p>
        )}
      </Section>
    </div>
  );
}
