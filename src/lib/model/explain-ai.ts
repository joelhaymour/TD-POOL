/**
 * Optional AI explanation layer via Vercel AI Gateway.
 * Only runs AFTER numeric model output exists.
 * Never invents statistics — structured facts only.
 *
 * Auth (priority):
 * 1. AI_GATEWAY_API_KEY
 * 2. VERCEL_OIDC_TOKEN (auto on Vercel / after `vercel env pull`)
 * 3. OPENAI_API_KEY (legacy direct OpenAI — not preferred)
 */

import { generateText } from "ai";
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
  if (process.env.ENABLE_PAID_PROVIDERS === "false") return false;
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim() ||
      process.env.OPENAI_API_KEY?.trim(),
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

  const modelId = process.env.OPENAI_MODEL?.trim() || "openai/gpt-5.4-mini";

  try {
    // Prefer AI Gateway (OIDC / AI_GATEWAY_API_KEY). Fall back to direct OpenAI only if needed.
    if (
      process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim() ||
      !process.env.OPENAI_API_KEY?.trim()
    ) {
      const result = await generateText({
        model: modelId,
        temperature: 0.2,
        system:
          "You write concise fantasy football anytime-TD analysis. Only use facts supplied in the structured input. Do not invent data, stats, ranks, or injuries. Return JSON with keys overview (string), whyWeLike (string[] 2-4), concerns (string[] 1-3), verdict (string).",
        prompt: JSON.stringify(payload),
      });

      const parsed = JSON.parse(result.text) as Partial<AiAnalysis>;
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
    }

    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId.includes("/") ? modelId.split("/")[1] : modelId,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write concise fantasy football anytime-TD analysis. Only use facts supplied in the structured input. Do not invent data, stats, ranks, or injuries. Return JSON with keys overview (string), whyWeLike (string[] 2-4), concerns (string[] 1-3), verdict (string).",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!res.ok) return { ...fallback, source: "deterministic" };
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
