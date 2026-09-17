import {
  gameCatalogueText,
  marketCatalogueText,
  teamCatalogueText,
} from "@/lib/tickets/catalogue";
import type { NflGame } from "@/lib/types";

/**
 * What the model records for one selection on the slip. Everything is
 * nullable on purpose: a number it cannot read must come back null, never
 * guessed, because a wrong line grades a real bet wrong.
 */
export type ReadLegRaw = {
  raw_text: string;
  game_id: string | null;
  player_name: string | null;
  market_key: string | null;
  outcome: string | null;
  line: number | null;
  american_odds: number | null;
  decimal_odds: number | null;
  confidence: "high" | "medium" | "low";
};

export type ReadTicketRaw = {
  sportsbook: string | null;
  bet_type: "single" | "parlay" | "same_game_parlay" | "unknown";
  stake: number | null;
  currency: "USD" | "CAD" | null;
  american_odds: number | null;
  decimal_odds: number | null;
  potential_payout: number | null;
  legs: ReadLegRaw[];
  notes: string | null;
};

export type TicketReaderStatus = "claude" | "fixture" | "off";

/**
 * The reader runs only where it is switched on AND has a key. Staging keeps
 * paid providers off as a rule, so this is its own flag, like the odds feed.
 * `fixture` is for working on the screens without spending anything.
 */
export function ticketReaderStatus(): TicketReaderStatus {
  if (process.env.TICKET_READER === "fixture") return "fixture";
  if (
    process.env.ENABLE_TICKET_READER === "true" &&
    process.env.ANTHROPIC_API_KEY?.trim()
  ) {
    return "claude";
  }
  return "off";
}

const DEFAULT_MODEL = "claude-sonnet-5";

const SYSTEM = `You read screenshots of sports betting slips and record every selection exactly as printed. You are careful with numbers: a line, price, stake or payout you cannot read clearly is null, never a guess. You only use the game ids and market keys you are given; anything that does not fit gets null and a low confidence.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "sportsbook",
    "bet_type",
    "stake",
    "currency",
    "american_odds",
    "decimal_odds",
    "potential_payout",
    "legs",
    "notes",
  ],
  properties: {
    sportsbook: {
      type: ["string", "null"],
      description:
        "Which book the slip is from, lowercase: bet365, fanduel, draftkings, betmgm. Null if not visible.",
    },
    bet_type: {
      type: "string",
      enum: ["single", "parlay", "same_game_parlay", "unknown"],
    },
    stake: { type: ["number", "null"], description: "Amount wagered." },
    currency: { type: ["string", "null"], enum: ["USD", "CAD", null] },
    american_odds: {
      type: ["integer", "null"],
      description: "Combined price of the whole slip in American format (+650 → 650, -110 → -110). Null if the slip shows decimal odds instead.",
    },
    decimal_odds: {
      type: ["number", "null"],
      description: "Combined price of the whole slip in decimal format (7.50). Null if the slip shows American odds instead.",
    },
    potential_payout: {
      type: ["number", "null"],
      description: "Total returned on a win, as the slip prints it (To Win / Potential Payout / Returns), stake included if the slip includes it.",
    },
    legs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "raw_text",
          "game_id",
          "player_name",
          "market_key",
          "outcome",
          "line",
          "american_odds",
          "decimal_odds",
          "confidence",
        ],
        properties: {
          raw_text: {
            type: "string",
            description: "The selection as printed, e.g. 'DJ Moore Over 4.5 Receptions'.",
          },
          game_id: {
            type: ["string", "null"],
            description: "Id from the games list this selection belongs to.",
          },
          player_name: {
            type: ["string", "null"],
            description: "Player as printed. For team totals, the team's full name. Null for game lines.",
          },
          market_key: { type: ["string", "null"] },
          outcome: {
            type: ["string", "null"],
            description: "over, under, yes, no — or the team's full name for a moneyline or spread.",
          },
          line: {
            type: ["number", "null"],
            description: "The number the bet is against: 4.5 for Over 4.5; 5 for a 5+ ladder; -3.5 for a spread; 1.5 for 2+ touchdowns. Null for anytime/first/last TD and moneylines.",
          },
          american_odds: { type: ["integer", "null"] },
          decimal_odds: { type: ["number", "null"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    notes: {
      type: ["string", "null"],
      description: "Anything you could not place: a cut-off leg, a market not in the list, a second page.",
    },
  },
} as const;

function userPrompt(games: NflGame[], bookHint: string | null): string {
  return [
    "Record every selection on this bet slip with the record_ticket tool.",
    bookHint ? `The share link says this slip is from ${bookHint}.` : "",
    "",
    "Games you may assign a selection to (use the id exactly; null if none matches):",
    gameCatalogueText(games),
    "",
    `Team codes: ${teamCatalogueText()}`,
    "",
    "Markets (use the key exactly; null if none fits):",
    marketCatalogueText(),
    "",
    "Rules:",
    '- "Over 4.5" style lines use the base market with outcome "over"/"under". "5+" / "5 or more" style ladders use the _alternate market with line 5 and outcome "over".',
    '- Anytime, first and last touchdown scorer: outcome "yes", line null.',
    "- Moneyline: outcome is the team's full name, line null. Spread: outcome is the team's full name, line is the signed number next to it.",
    "- Totals: outcome over/under, line the number. Team total: team's full name in player_name.",
    "- Prices: fill american_odds when the slip prints +140 / -110, decimal_odds when it prints 2.40 / 1.91. Never both, never converted.",
    "- If a selection's game is not in the list, keep the selection with game_id null and confidence low.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export type ReadTicketResult = {
  raw: ReadTicketRaw;
  reader: TicketReaderStatus;
  usage: { input: number; output: number } | null;
};

/**
 * Read one screenshot. The image is sent as-is (the client already scaled it
 * down), together with the games it could belong to and our market list, and
 * the model must answer through a tool call so the shape is guaranteed.
 */
export async function readTicketImage(input: {
  image: { bytes: Buffer; mediaType: string };
  games: NflGame[];
  bookHint: string | null;
}): Promise<ReadTicketResult> {
  const status = ticketReaderStatus();
  if (status === "fixture") {
    return { raw: fixtureTicket(input.games), reader: "fixture", usage: null };
  }
  if (status === "off") {
    throw new TicketReaderError(
      "Ticket reading isn't switched on here — add the legs by hand.",
      "READER_OFF",
    );
  }

  const model = process.env.TICKET_READER_MODEL?.trim() || DEFAULT_MODEL;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!.trim(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(50_000),
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      tools: [
        {
          name: "record_ticket",
          description: "Record the selections, price and stake on a bet slip.",
          input_schema: SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "record_ticket" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.image.mediaType,
                data: input.image.bytes.toString("base64"),
              },
            },
            { type: "text", text: userPrompt(input.games, input.bookHint) },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("ticket reader failed", res.status, detail.slice(0, 500));
    throw new TicketReaderError(
      res.status === 401 || res.status === 403
        ? "The ticket reader's key was rejected."
        : "The ticket reader couldn't read that picture. Try again or add the legs by hand.",
      "READER_FAILED",
    );
  }

  const json = (await res.json()) as {
    content?: Array<{ type: string; name?: string; input?: unknown }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const call = json.content?.find(
    (c) => c.type === "tool_use" && c.name === "record_ticket",
  );
  if (!call?.input || typeof call.input !== "object") {
    throw new TicketReaderError(
      "The ticket reader returned nothing usable. Try a clearer screenshot.",
      "READER_FAILED",
    );
  }

  return {
    raw: coerceRaw(call.input as Record<string, unknown>),
    reader: "claude",
    usage: {
      input: json.usage?.input_tokens ?? 0,
      output: json.usage?.output_tokens ?? 0,
    },
  };
}

export class TicketReaderError extends Error {
  constructor(
    message: string,
    readonly code: "READER_OFF" | "READER_FAILED",
  ) {
    super(message);
    this.name = "TicketReaderError";
  }
}

/** The tool schema is enforced, but a model can still hand back a string for a number. */
function coerceRaw(input: Record<string, unknown>): ReadTicketRaw {
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number.parseFloat(v.replace(/[^0-9.+-]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const conf = (v: unknown): ReadLegRaw["confidence"] =>
    v === "high" || v === "medium" || v === "low" ? v : "low";
  const betType = (v: unknown): ReadTicketRaw["bet_type"] =>
    v === "single" || v === "parlay" || v === "same_game_parlay" ? v : "unknown";
  const currency = (v: unknown): ReadTicketRaw["currency"] =>
    v === "USD" || v === "CAD" ? v : null;

  const legs = Array.isArray(input.legs) ? input.legs : [];
  return {
    sportsbook: str(input.sportsbook)?.toLowerCase() ?? null,
    bet_type: betType(input.bet_type),
    stake: num(input.stake),
    currency: currency(input.currency),
    american_odds: num(input.american_odds),
    decimal_odds: num(input.decimal_odds),
    potential_payout: num(input.potential_payout),
    legs: legs
      .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === "object")
      .map((l) => ({
        raw_text: str(l.raw_text) ?? "",
        game_id: str(l.game_id),
        player_name: str(l.player_name),
        market_key: str(l.market_key),
        outcome: str(l.outcome),
        line: num(l.line),
        american_odds: num(l.american_odds),
        decimal_odds: num(l.decimal_odds),
        confidence: conf(l.confidence),
      })),
    notes: str(input.notes),
  };
}

/** A believable slip on the week's first two games, for building the screens. */
function fixtureTicket(games: NflGame[]): ReadTicketRaw {
  const [a, b] = games;
  return {
    sportsbook: "bet365",
    bet_type: "parlay",
    stake: 20,
    currency: "CAD",
    american_odds: 612,
    decimal_odds: null,
    potential_payout: 142.4,
    legs: [
      {
        raw_text: "Sample Receiver Over 4.5 Receptions",
        game_id: a?.id ?? null,
        player_name: "Sample Receiver",
        market_key: "player_receptions",
        outcome: "over",
        line: 4.5,
        american_odds: -120,
        decimal_odds: null,
        confidence: "high",
      },
      {
        raw_text: "Sample Back Anytime Touchdown Scorer",
        game_id: a?.id ?? null,
        player_name: "Sample Back",
        market_key: "player_anytime_td",
        outcome: "yes",
        line: null,
        american_odds: 150,
        decimal_odds: null,
        confidence: "high",
      },
      {
        raw_text: `${b?.home_team ?? "Home"} -3.5`,
        game_id: b?.id ?? null,
        player_name: null,
        market_key: "spreads",
        outcome: b?.home_team ?? null,
        line: -3.5,
        american_odds: -110,
        decimal_odds: null,
        confidence: "medium",
      },
    ],
    notes: "Fixture read — no picture was sent to a model.",
  };
}
