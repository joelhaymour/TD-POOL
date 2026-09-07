/** NFL regular-season week calendar helpers (simple Thu–Wed weeks). */

export type NflWeekRef = {
  season: number;
  week: number;
  start: Date;
  end: Date;
};

/** Week 1 of 2025 starts Thursday 2025-09-04 (local US kickoff week). */
const WEEK1_START_BY_SEASON: Record<number, string> = {
  2025: "2025-09-04T00:00:00.000Z",
  2026: "2026-09-10T00:00:00.000Z",
};

const REGULAR_SEASON_WEEKS = 18;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseUtcDate(iso: string): Date {
  return new Date(iso);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Build the Thu–Wed week table for a season.
 * Week N starts at Week1Start + (N-1)*7 days and ends 7 days later (exclusive end = next Thu).
 */
export function listSeasonWeeks(season: number): NflWeekRef[] {
  const startIso = WEEK1_START_BY_SEASON[season];
  if (!startIso) {
    // Fallback: assume first Thursday on/after Sep 4 of that year.
    const approx = new Date(Date.UTC(season, 8, 4));
    const day = approx.getUTCDay(); // 0 Sun … 4 Thu
    const delta = (4 - day + 7) % 7;
    const week1 = addDays(approx, delta);
    return buildWeeks(season, week1);
  }
  return buildWeeks(season, parseUtcDate(startIso));
}

function buildWeeks(season: number, week1Start: Date): NflWeekRef[] {
  const weeks: NflWeekRef[] = [];
  for (let week = 1; week <= REGULAR_SEASON_WEEKS; week += 1) {
    const start = addDays(week1Start, (week - 1) * 7);
    const end = addDays(start, 7);
    weeks.push({ season, week, start, end });
  }
  return weeks;
}

/**
 * Map a calendar date to an NFL regular-season week.
 * Returns null if the date falls outside the season window.
 */
export function getNflWeekForDate(
  date: Date,
  season?: number,
): { season: number; week: number } | null {
  const seasons =
    season != null
      ? [season]
      : Object.keys(WEEK1_START_BY_SEASON)
          .map(Number)
          .sort((a, b) => a - b);

  const t = date.getTime();
  for (const s of seasons) {
    for (const w of listSeasonWeeks(s)) {
      if (t >= w.start.getTime() && t < w.end.getTime()) {
        return { season: w.season, week: w.week };
      }
    }
  }

  // If no explicit season table matched and season was omitted, try nearby years.
  if (season == null) {
    const y = date.getUTCFullYear();
    for (const s of [y - 1, y, y + 1]) {
      if (seasons.includes(s)) continue;
      for (const w of listSeasonWeeks(s)) {
        if (t >= w.start.getTime() && t < w.end.getTime()) {
          return { season: w.season, week: w.week };
        }
      }
    }
  }

  return null;
}

/**
 * Active pool week for the product:
 * - During the season → calendar week
 * - Before Week 1 kickoff → upcoming Week 1
 * - After Week 18 → stay on Week 18 of that season until next Week 1 window opens
 */
export function resolvePoolWeek(asOf: Date = new Date()): {
  season: number;
  week: number;
} {
  const mapped = getNflWeekForDate(asOf);
  if (mapped) return mapped;

  const y = asOf.getUTCFullYear();
  for (const season of [y - 1, y, y + 1, y + 2]) {
    const weeks = listSeasonWeeks(season);
    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    if (!first || !last) continue;
    if (asOf.getTime() < first.start.getTime()) {
      return { season, week: 1 };
    }
    if (
      asOf.getTime() >= last.start.getTime() &&
      asOf.getTime() < last.end.getTime() + 7 * MS_PER_DAY
    ) {
      return { season, week: last.week };
    }
  }

  return { season: y, week: 1 };
}

export function nextPoolWeek(
  season: number,
  week: number,
): { season: number; week: number } | null {
  if (week < REGULAR_SEASON_WEEKS) return { season, week: week + 1 };
  return { season: season + 1, week: 1 };
}

export function weekWindow(
  season: number,
  week: number,
): { start_date: string; end_date: string; label: string } {
  const ref =
    listSeasonWeeks(season).find((w) => w.week === week) ??
    listSeasonWeeks(season)[0]!;
  const start = ref.start.toISOString().slice(0, 10);
  const endExclusive = ref.end;
  const end = new Date(endExclusive.getTime() - MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  return {
    start_date: start,
    end_date: end,
    label: `NFL Week ${week}`,
  };
}
