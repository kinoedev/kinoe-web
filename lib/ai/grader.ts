import { gradeWithAnthropic } from "./anthropic";
import { gradeWithOpenAI } from "./openai";
import type { GraderInput, GradeResult } from "./types";

export async function gradeJournalEntry(input: GraderInput): Promise<GradeResult> {
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  if (provider === "openai") return gradeWithOpenAI(input);
  return gradeWithAnthropic(input);
}
