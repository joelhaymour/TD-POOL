/**
 * Optional OpenAI explanation layer.
 * Only runs AFTER numeric model output exists.
 * Never invents statistics — structured facts only.
 */

import type { PlayerWeekFeatures, TdPoolModelOutput } from "@/lib/model/features";
import { buildDeterministicAnalysis } from "@/lib/model/explain";

export type AiAnalysis = {
  overview: string;
  whyWeLike: string[];
  concerns: string[];
  verdict: string;
  source: "openai" | "deterministic";
};

export function isOpenAiConfigured(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() || process.env.AI_GATEWAY_API_KEY?.trim(),
  );
}

export async function generatePlayerAnalysisCopy(
  features: PlayerWeekFeatures,
  model: TdPoolModelOutput,
): Promise<AiAnalysis> {
  const fallback = buildDeterministicAnalysis(features, model);
  if (!isOpenAiConfigured()) {
    return { ...fallback, source: "deterministic" };
  }

  const payload = {
    player: features.playerName,
    position: features.position,
    team: features.team,
    opponent: features.opponent,
    tdPoolProbability: model.tdPoolProbability,
    marketProbability: model.marketProbability,
    goalLinePercentile: model.goalLinePercentile,
    matchupPercentile: model.matchupPercentile,
    teamImpliedPoints: features.teamImpliedPoints,
    inside5Share: features.inside5TeamShare,
    recentUsageTrend: features.recentTouchTrend,
    positiveFactors: model.contributions.filter((c) => c.delta > 0.008),
    negativeFactors: model.contributions.filter((c) => c.delta < -0.008),
    opponentDataLabel: features.opponentDataLabel,
    limitedData: model.limitedData,
  };

  try {
    const apiKey =
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.AI_GATEWAY_API_KEY?.trim();
    const base =
      process.env.OPENAI_BASE_URL?.trim() ||
      (process.env.AI_GATEWAY_API_KEY
        ? "https://ai-gateway.vercel.sh/v1"
        : "https://api.openai.com/v1");
    const modelId = process.env.OPENAI_MODEL?.trim() || "openai/gpt-4.1-mini";

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write concise fantasy football anytime-TD analysis. Only use facts supplied in the structured input. Do not invent data, stats, ranks, or injuries. Return JSON with keys overview (string), whyWeLike (string[] 2-4), concerns (string[] 1-3), verdict (string).",
          },
          {
            role: "user",
            content: JSON.stringify(payload),
          },
        ],
      }),
    });

    if (!res.ok) {
      return { ...fallback, source: "deterministic" };
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ...fallback, source: "deterministic" };
    const parsed = JSON.parse(content) as Partial<AiAnalysis>;
    return {
      overview: parsed.overview || fallback.overview,
      whyWeLike:
        Array.isArray(parsed.whyWeLike) && parsed.whyWeLike.length
          ? parsed.whyWeLike.slice(0, 4)
          : fallback.whyWeLike,
      concerns:
        Array.isArray(parsed.concerns) && parsed.concerns.length
          ? parsed.concerns.slice(0, 3)
          : fallback.concerns,
      verdict: parsed.verdict || fallback.verdict,
      source: "openai",
    };
  } catch {
    return { ...fallback, source: "deterministic" };
  }
}
