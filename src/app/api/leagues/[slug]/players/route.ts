import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { storeErrorResponse } from "@/lib/api/store-error";
import { requireApiMembership } from "@/lib/auth/api";
import { toPlayerCard } from "@/lib/api/mappers";
import type { PlayerPosition } from "@/lib/types";

export async function GET(
  request: Request,
  context: RouteContext<"/api/leagues/[slug]/players">,
) {
  try {
    const { slug } = await context.params;
    const access = await requireApiMembership(slug);
    if (!access.ok) return access.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
    const position = searchParams.get("position");
    const available = searchParams.get("available");
    const sort = searchParams.get("sort") ?? "rank";

    const store = getStore();
    const dashboard = await store.getDashboard(slug);
    if (!dashboard) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    let players = dashboard.ranked_players.map((row) =>
      toPlayerCard(row, slug, dashboard.picks_locked),
    );

    if (search) {
      players = players.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.team.toLowerCase().includes(search) ||
          p.opponent.toLowerCase().includes(search),
      );
    }

    if (position && position !== "ALL") {
      players = players.filter(
        (p) => p.position === (position as PlayerPosition),
      );
    }

    if (available === "true" || available === "1") {
      players = players.filter((p) => p.availability === "available");
    }

    switch (sort) {
      case "our_prob":
        players.sort((a, b) => b.ourProbability - a.ourProbability);
        break;
      case "market_prob":
        players.sort(
          (a, b) => (b.marketProbability ?? -1) - (a.marketProbability ?? -1),
        );
        break;
      case "odds":
        players.sort(
          (a, b) => (a.americanOdds ?? 9999) - (b.americanOdds ?? 9999),
        );
        break;
      case "rank":
      default:
        players.sort((a, b) => a.rank - b.rank);
        break;
    }

    return NextResponse.json({
      week: dashboard.week,
      picks_locked: dashboard.picks_locked,
      players,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}
