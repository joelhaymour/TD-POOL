import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { autoSyncLeagueWeek } from "@/lib/services/sync-nfl-week";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;

    await autoSyncLeagueWeek(slug);
    const store = getStore();
    const league = await store.getLeagueBySlug(slug);
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const [members, weeks] = await Promise.all([
      store.listMembers(league.id),
      store.listWeeks(),
    ]);

    type Acc = {
      memberId: string;
      memberName: string;
      correct: number;
      decided: number;
      oddsSum: number;
      oddsCount: number;
    };

    const byMember = new Map<string, Acc>();
    for (const m of members) {
      byMember.set(m.id, {
        memberId: m.id,
        memberName: m.display_name,
        correct: 0,
        decided: 0,
        oddsSum: 0,
        oddsCount: 0,
      });
    }

    // Aggregate picks across all weeks that have league activity.
    // With a single seed week this is just the current week.
    let weeksCounted = 0;
    for (const week of weeks) {
      const picks = await store.getPicksForWeek(league.id, week.id);
      if (picks.length === 0 && week.id !== league.active_week_id) continue;
      if (picks.length === 0) continue;
      weeksCounted += 1;

      for (const pick of picks) {
        const row = byMember.get(pick.member_id);
        if (!row) continue;
        row.oddsSum += pick.odds_at_selection;
        row.oddsCount += 1;
        if (pick.result === "td" || pick.result === "no_td") {
          row.decided += 1;
          if (pick.result === "td") row.correct += 1;
        }
      }
    }

    // Fallback: if no picks anywhere, still return members at 0/0 from dashboard.
    if (weeksCounted === 0) {
      const dashboard = await store.getDashboard(slug);
      if (dashboard) {
        for (const m of dashboard.members) {
          const row = byMember.get(m.member.id);
          if (!row || !m.pick) continue;
          row.oddsSum += m.pick.odds_at_selection;
          row.oddsCount += 1;
          if (m.pick.result === "td" || m.pick.result === "no_td") {
            row.decided += 1;
            if (m.pick.result === "td") row.correct += 1;
          }
        }
        weeksCounted = 1;
      }
    }

    const standings = [...byMember.values()]
      .map((row) => {
        const hitPct =
          row.decided > 0
            ? Math.round((row.correct / row.decided) * 1000) / 10
            : 0;
        const avgOdds =
          row.oddsCount > 0
            ? Math.round(row.oddsSum / row.oddsCount)
            : null;
        return {
          memberId: row.memberId,
          memberName: row.memberName,
          correct: row.correct,
          decided: row.decided,
          hitPct,
          avgOdds,
        };
      })
      .sort((a, b) => {
        if (b.correct !== a.correct) return b.correct - a.correct;
        if (b.hitPct !== a.hitPct) return b.hitPct - a.hitPct;
        if (b.decided !== a.decided) return b.decided - a.decided;
        return a.memberName.localeCompare(b.memberName);
      })
      .map((row, index) => ({
        rank: index + 1,
        ...row,
      }));

    return NextResponse.json({
      league: {
        id: league.id,
        slug: league.slug,
        name: league.name,
      },
      weeksCounted,
      standings,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
