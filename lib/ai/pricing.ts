import type { Usage } from "./types";

type Rate = { input_per_m: number; output_per_m: number };

const ANTHROPIC_PRICING: Record<string, Rate> = {
  "claude-opus-4-7":   { input_per_m: 5.0, output_per_m: 25.0 },
  "claude-opus-4-6":   { input_per_m: 5.0, output_per_m: 25.0 },
  "claude-sonnet-4-6": { input_per_m: 3.0, output_per_m: 15.0 },
  "claude-haiku-4-5":  { input_per_m: 1.0, output_per_m: 5.0 },
};

const OPENAI_PRICING: Record<string, Rate> = {
  "gpt-4o":      { input_per_m: 2.50, output_per_m: 10.00 },
  "gpt-4o-mini": { input_per_m: 0.15, output_per_m: 0.60 },
  "gpt-4.1":     { input_per_m: 2.00, output_per_m: 8.00 },
};

export function anthropicCostUsd(model: string, usage: Usage): number {
  const rate = ANTHROPIC_PRICING[model];
  if (!rate) return 0;
  const inputCost = (usage.input_tokens / 1_000_000) * rate.input_per_m;
  const cacheWriteCost = (usage.cache_creation_input_tokens / 1_000_000) * rate.input_per_m * 1.25;
  const cacheReadCost = (usage.cache_read_input_tokens / 1_000_000) * rate.input_per_m * 0.1;
  const outputCost = (usage.output_tokens / 1_000_000) * rate.output_per_m;
  return Number((inputCost + cacheWriteCost + cacheReadCost + outputCost).toFixed(6));
}

export function openaiCostUsd(model: string, usage: Usage): number {
  const rate = OPENAI_PRICING[model];
  if (!rate) return 0;
  const inputCost = (usage.input_tokens / 1_000_000) * rate.input_per_m;
  const outputCost = (usage.output_tokens / 1_000_000) * rate.output_per_m;
  return Number((inputCost + outputCost).toFixed(6));
}
