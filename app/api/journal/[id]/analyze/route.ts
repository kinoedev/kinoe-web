import { NextRequest, NextResponse } from "next/server";
import { getJournalEntry, recordJournalGrade } from "@/lib/db/queries";
import { gradeJournalEntry } from "@/lib/ai/grader";
import { buildUserPrompt } from "@/lib/ai/prompts";
import type { GraderInput } from "@/lib/ai/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const entry = await getJournalEntry(id);
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const input: GraderInput = {
    pair: entry.pair,
    timeframe: entry.timeframe,
    direction: entry.direction,
    setup_type: entry.setup_type,
    bias: entry.bias,
    entry_price: entry.entry_price,
    stop_loss: entry.stop_loss,
    take_profit: entry.take_profit,
    risk_reward: entry.risk_reward,
    risk_pct: entry.risk_pct,
    thesis_md: entry.thesis_md,
    outcome: entry.outcome,
    exit_price: entry.exit_price,
    r_multiple: entry.r_multiple,
    review_md: entry.review_md,
  };

  try {
    const result = await gradeJournalEntry(input);

    const updated = await recordJournalGrade(id, {
      grade: result.output.grade,
      score: result.output.score,
      review_md: result.output.review_md,
      provider: result.provider,
      model: result.model,
      cost_usd: result.cost_usd,
      prompt_md: buildUserPrompt(input),
      response_json: result.output,
      input_tokens: result.usage.input_tokens + result.usage.cache_read_input_tokens + result.usage.cache_creation_input_tokens,
      output_tokens: result.usage.output_tokens,
    });

    return NextResponse.json({
      ok: true,
      entry: updated,
      grade: result.output,
      usage: result.usage,
      cost_usd: result.cost_usd,
      provider: result.provider,
      model: result.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
