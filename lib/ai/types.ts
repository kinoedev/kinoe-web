import { z } from "zod";

export const GradeOutputSchema = z.object({
  grade: z.enum(["A", "B", "C", "D", "F"]),
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string()).min(1).max(6),
  weaknesses: z.array(z.string()).min(1).max(6),
  review_md: z.string(),
});

export type GradeOutput = z.infer<typeof GradeOutputSchema>;

export type GraderInput = {
  pair: string;
  timeframe: string;
  direction: "LONG" | "SHORT";
  setup_type: string | null;
  bias: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  risk_reward: number | null;
  risk_pct: number | null;
  thesis_md: string | null;
  outcome: string | null;
  exit_price: number | null;
  r_multiple: number | null;
  review_md: string | null;
};

export type Usage = {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
};

export type GradeResult = {
  output: GradeOutput;
  provider: "anthropic" | "openai";
  model: string;
  usage: Usage;
  cost_usd: number;
};

export type Grader = (input: GraderInput) => Promise<GradeResult>;
