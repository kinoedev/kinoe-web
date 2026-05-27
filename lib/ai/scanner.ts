import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropicCostUsd } from "./pricing";
import type { PairAnalysisResult } from "@/lib/signals/detection";

const ScanSummarySchema = z.object({
  overallSummary: z.string(),
  pairs: z.array(
    z.object({
      pair: z.string(),
      aiSummary: z.string(),
    })
  ),
});

export type ScanSummaryOutput = z.infer<typeof ScanSummarySchema>;

const SYSTEM_PROMPT = `You are a professional naked forex trader reviewing pre-calculated market analysis. Your job is to write clear, concise summaries explaining what the rule engine found.

Rules:
- Write 2-3 sentences per pair (aiSummary). Be specific: mention the setup type, bias direction, trade status, and key levels if relevant.
- Write 2-3 sentences for overallSummary covering the broad market picture across all pairs.
- DO NOT invent prices, scores, setups, or change any values — only reference data you were given.
- If no setup is detected, explain what conditions are missing and what to watch for.
- Tone: professional, direct, no hype.`;

function buildSummaryPrompt(analyses: PairAnalysisResult[]): string {
  const sections = analyses.map((r) => {
    const levels = r.keyLevels
      .map((l) => `    ${l.type.toUpperCase()}: ${l.price} (str: ${l.strengthScore}, ${l.reason})`)
      .join("\n");

    const plan = r.potentialTradePlan
      ? `  Trade plan: ${r.potentialTradePlan.direction} — entry: ${r.potentialTradePlan.entryTrigger}, SL: ${r.potentialTradePlan.stopLoss}, TP: ${r.potentialTradePlan.takeProfit}, RR: ${r.potentialTradePlan.riskReward}:1
  Invalidation: ${r.potentialTradePlan.invalidation}`
      : "  No trade plan.";

    return `## ${r.pair}
  Status: ${r.tradeStatus} | Confidence: ${r.confidenceScore}/100
  HTF bias (D1): ${r.higherTimeframeBias} | Execution (H4): ${r.executionTimeframeBias}
  Market state: ${r.marketState} | Setup detected: ${r.setupDetected ? r.setupType : "None"}
${plan}
  Blockers: ${r.blockers.length ? r.blockers.join("; ") : "None"}
  Triggers: ${r.triggerConditions.join("; ")}
  Key levels:
${levels || "    None identified"}`;
  });

  return `Pre-calculated analysis as of ${new Date().toUTCString()}:

${sections.join("\n\n")}

Write aiSummary for each pair and an overallSummary.`;
}

export async function summariseWithAI(analyses: PairAnalysisResult[]): Promise<{
  output: ScanSummaryOutput;
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
    max_tokens: 2048,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildSummaryPrompt(analyses) }],
    output_config: { format: zodOutputFormat(ScanSummarySchema) },
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
