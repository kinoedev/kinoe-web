import { sql } from "./client";
import type { JournalEntry, NewJournalEntry, UpdateJournalEntry } from "./types";

export async function listJournalEntries(limit = 100): Promise<JournalEntry[]> {
  const rows = await sql`
    SELECT * FROM journal_entries
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as JournalEntry[];
}

export async function getJournalEntry(id: string): Promise<JournalEntry | null> {
  const rows = await sql`SELECT * FROM journal_entries WHERE id = ${id}`;
  return (rows[0] as JournalEntry) ?? null;
}

export async function createJournalEntry(input: NewJournalEntry): Promise<JournalEntry> {
  const rows = await sql`
    INSERT INTO journal_entries (
      pair, timeframe, direction, setup_type, bias,
      entry_price, stop_loss, take_profit, risk_reward,
      position_size, risk_pct,
      entered_at, thesis_md,
      emotion_tags, chart_urls,
      source
    ) VALUES (
      ${input.pair}, ${input.timeframe}, ${input.direction},
      ${input.setup_type ?? null}, ${input.bias ?? null},
      ${input.entry_price ?? null}, ${input.stop_loss ?? null},
      ${input.take_profit ?? null}, ${input.risk_reward ?? null},
      ${input.position_size ?? null}, ${input.risk_pct ?? null},
      ${input.entered_at ?? null}, ${input.thesis_md ?? null},
      ${input.emotion_tags ?? []}, ${input.chart_urls ?? []},
      ${input.source ?? "manual"}
    )
    RETURNING *
  `;
  return rows[0] as JournalEntry;
}

export async function findRecentAgentSignal(
  pair: string,
  timeframe: string,
  entryPrice: number
): Promise<JournalEntry | null> {
  const rows = await sql`
    SELECT * FROM journal_entries
    WHERE source = 'agent_signal'
      AND pair = ${pair}
      AND timeframe = ${timeframe}
      AND entry_price = ${entryPrice}
      AND created_at > now() - interval '4 hours'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (rows[0] as JournalEntry) ?? null;
}

export async function updateJournalEntry(
  id: string,
  patch: UpdateJournalEntry
): Promise<JournalEntry | null> {
  const rows = await sql`
    UPDATE journal_entries SET
      exited_at    = COALESCE(${patch.exited_at ?? null}, exited_at),
      outcome      = COALESCE(${patch.outcome ?? null}, outcome),
      exit_price   = COALESCE(${patch.exit_price ?? null}, exit_price),
      r_multiple   = COALESCE(${patch.r_multiple ?? null}, r_multiple),
      pnl          = COALESCE(${patch.pnl ?? null}, pnl),
      review_md    = COALESCE(${patch.review_md ?? null}, review_md),
      emotion_tags = COALESCE(${patch.emotion_tags ?? null}, emotion_tags),
      mistake_tags = COALESCE(${patch.mistake_tags ?? null}, mistake_tags),
      lesson_tags  = COALESCE(${patch.lesson_tags ?? null}, lesson_tags),
      chart_urls   = COALESCE(${patch.chart_urls ?? null}, chart_urls),
      updated_at   = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as JournalEntry) ?? null;
}

export async function deleteJournalEntry(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM journal_entries WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export type GradeRecord = {
  grade: string;
  score: number;
  review_md: string;
  provider: string;
  model: string;
  cost_usd: number;
  prompt_md: string;
  response_json: unknown;
  input_tokens: number;
  output_tokens: number;
};

export async function recordJournalGrade(
  entryId: string,
  grade: GradeRecord
): Promise<JournalEntry | null> {
  const rows = await sql`
    UPDATE journal_entries SET
      ai_grade      = ${grade.grade},
      ai_score      = ${grade.score},
      ai_review_md  = ${grade.review_md},
      ai_provider   = ${grade.provider},
      ai_model      = ${grade.model},
      ai_cost_usd   = ${grade.cost_usd},
      updated_at    = now()
    WHERE id = ${entryId}
    RETURNING *
  `;
  if (rows.length === 0) return null;

  await sql`
    INSERT INTO ai_analyses (
      entry_id, kind, provider, model,
      prompt_md, response_md, response_json,
      input_tokens, output_tokens, cost_usd
    ) VALUES (
      ${entryId}, 'journal_grade', ${grade.provider}, ${grade.model},
      ${grade.prompt_md}, ${grade.review_md}, ${JSON.stringify(grade.response_json)},
      ${grade.input_tokens}, ${grade.output_tokens}, ${grade.cost_usd}
    )
  `;

  return rows[0] as JournalEntry;
}
