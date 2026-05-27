import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { GRADER_SYSTEM_PROMPT, buildUserPrompt } from "./prompts";
import { openaiCostUsd } from "./pricing";
import { GradeOutputSchema, type GraderInput, type GradeResult } from "./types";

export async function gradeWithOpenAI(input: GraderInput): Promise<GradeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = process.env.AI_MODEL_OPENAI || "gpt-4o";
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.parse({
    model,
    messages: [
      { role: "system", content: GRADER_SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
    response_format: zodResponseFormat(GradeOutputSchema, "grade"),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) throw new Error("OpenAI returned no parsed output");

  const usage = {
    input_tokens: completion.usage?.prompt_tokens ?? 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    output_tokens: completion.usage?.completion_tokens ?? 0,
  };

  return {
    output: parsed,
    provider: "openai",
    model,
    usage,
    cost_usd: openaiCostUsd(model, usage),
  };
}
