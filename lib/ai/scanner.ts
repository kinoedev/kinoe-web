import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropicCostUsd } from "./pricing";
import type { KeyLevel, ParsedCandle } from "@/lib/signals/detection";

const KeyLevelSchema = z.object({
  price: z.number(),
  type: z.enum(["support", "resistance"]),
  notes: z.string(),
});

const SetupSchema = z.object({
  name: z.string(),
  direction: z.enum(["LONG", "SHORT"]),
  entry: z.number(),
  stop: z.number(),
  target: z.number(),
  rr: z.number(),
  confidence: z.number().int().min(1).max(5),
  notes: z.string(),
});

const PairScanSchema = z.object({
  pair: z.string(),
  bias: z.enum(["BULLISH", "BEARISH", "NEUTRAL", "WATCH"]),
  trend_strength: z.enum(["STRONG", "MODERATE", "WEAK"]),
  key_levels: z.array(KeyLevelSchema).max(4),
  setup_found: z.boolean(),
  setup: z.union([SetupSchema, z.null()]),
  watch: z.string(),
});

export const ScanOutputSchema = z.object({
  summary: z.string(),
  pairs: z.array(PairScanSchema),
});

export type ScanOutput = z.infer<typeof ScanOutputSchema>;
export type PairScan = z.infer<typeof PairScanSchema>;

const SYSTEM_PROMPT = `You are a professional naked forex trader with deep experience in price action. You analyse markets with no indicators — only candle structure, key levels, and pattern recognition.

Setups you identify:
- Kangaroo Tail (KT): Rejection candle with wick >60% of range and body <30%. Strong reversal signal at key levels.
- Big Shadow: Engulfing candle (high > prev high, low < prev low) with body >70% of range. Momentum signal.
- Inside Bar (IB): Current candle fully inside prior candle. Compression before breakout.

Key level rules:
- Swing highs (local max) = resistance. Swing lows (local min) = support.
- Round numbers matter on XAU (nearest 50/100) and FX (nearest 0.005/0.010).
- Mark the 2-3 most relevant levels closest to current price.

Trade plan format when a setup is present:
- Entry: close of signal candle (or break of level for IB)
- Stop: beyond the key level (above wick high for bearish, below wick low for bullish)
- Target: next significant opposing level
- RR: calculated from entry/stop/target
- Confidence: 1-5 (5 = all stars aligned — trend, level, pattern, momentum)

When there is no high-probability setup, set setup_found: false and setup: null. Explain in watch what would change your view.

Bias rules: BULLISH/BEARISH = directional with setup or strong trend. WATCH = wait for confirmation. NEUTRAL = ranging/no clear edge.`;

export type PairInput = {
  pair: string;
  d1_bias: string;
  h4_candles: ParsedCandle[];
  patterns: { kt: boolean; big_shadow: boolean; inside_bar: boolean; bias: string };
  key_levels_raw: KeyLevel[];
};

function buildScanPrompt(pairs: PairInput[]): string {
  const sections = pairs.map((p) => {
    const last12 = p.h4_candles.slice(-12);
    const candleTable = last12
      .map((c) => `  ${c.time.slice(0, 16)} | O:${c.open} H:${c.high} L:${c.low} C:${c.close}`)
      .join("\n");

    const patterns: string[] = [];
    if (p.patterns.kt) patterns.push(`Kangaroo Tail (${p.patterns.bias === "BULL" ? "bullish" : "bearish"})`);
    if (p.patterns.big_shadow) patterns.push(`Big Shadow`);
    if (p.patterns.inside_bar) patterns.push(`Inside Bar`);

    const levels = p.key_levels_raw.map((l) => `  ${l.type.toUpperCase()}: ${l.price}`).join("\n");

    return `### ${p.pair}
D1 bias: ${p.d1_bias} | H4 bias: ${p.patterns.bias}
Rule-based patterns on latest H4 candle: ${patterns.length ? patterns.join(", ") : "none"}
Nearby key levels:
${levels || "  none identified"}
Last 12 H4 candles (UTC):
${candleTable}`;
  });

  return `Analyse the following pairs using naked forex price action. UTC time now: ${new Date().toUTCString()}.

${sections.join("\n\n")}

Return your analysis. Use the exact pair names as shown (e.g. "EUR_USD") in the pairs array.`;
}

export async function scanMarketsWithAI(pairs: PairInput[]): Promise<{
  output: ScanOutput;
  model: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const model = process.env.AI_MODEL_SCANNER || "claude-sonnet-4-6";
  const client = new Anthropic({ apiKey });

  const response = await client.messages.parse({
    model,
    max_tokens: 4096,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildScanPrompt(pairs) }],
    output_config: { format: zodOutputFormat(ScanOutputSchema) },
  });

  if (!response.parsed_output) throw new Error("AI returned no parsed output");

  const usage = {
    input_tokens: response.usage.input_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    output_tokens: response.usage.output_tokens,
  };

  return {
    output: response.parsed_output,
    model,
    cost_usd: anthropicCostUsd(model, usage),
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
  };
}
