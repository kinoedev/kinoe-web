import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GRADER_SYSTEM_PROMPT, buildUserPrompt } from "./prompts";
import { anthropicCostUsd } from "./pricing";
import { GradeOutputSchema, type GraderInput, type GradeResult } from "./types";

export async function gradeWithAnthropic(input: GraderInput): Promise<GradeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const model = process.env.AI_MODEL_ANTHROPIC || "claude-opus-4-7";
  const client = new Anthropic({ apiKey });

  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    system: [
      {
        type: "text",
        text: GRADER_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUserPrompt(input) }],
    output_config: { format: zodOutputFormat(GradeOutputSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Anthropic returned no parsed output");
  }

  const usage = {
    input_tokens: response.usage.input_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    output_tokens: response.usage.output_tokens,
  };

  return {
    output: response.parsed_output,
    provider: "anthropic",
    model,
    usage,
    cost_usd: anthropicCostUsd(model, usage),
  };
}
