import { sql } from "./client";
import type {
  JournalEntry, NewJournalEntry, UpdateJournalEntry,
  AgentSettings, NewAgentSettings, AgentRun, AgentCandidate, CandidateDecision,
} from "./types";

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

// ─── Agent queries ────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Omit<AgentSettings, "id" | "created_at" | "updated_at"> = {
  agent_mode: "OFF",
  kill_switch: false,
  max_trades_per_day: 3,
  min_confidence_score: 75,
  min_risk_reward: 3.0,
  max_risk_per_trade_pct: 0.25,
  allowed_pairs: ["EUR_USD", "GBP_USD", "XAU_USD"],
  allowed_timeframes: ["H4"],
  telegram_chat_id: null,
};

export async function getAgentSettings(): Promise<AgentSettings> {
  const rows = await sql`SELECT * FROM agent_settings ORDER BY created_at ASC LIMIT 1`;
  if (rows.length > 0) return rows[0] as AgentSettings;

  const created = await sql`
    INSERT INTO agent_settings (
      agent_mode, kill_switch, max_trades_per_day, min_confidence_score,
      min_risk_reward, max_risk_per_trade_pct, allowed_pairs, allowed_timeframes,
      telegram_chat_id
    ) VALUES (
      ${DEFAULT_SETTINGS.agent_mode}, ${DEFAULT_SETTINGS.kill_switch},
      ${DEFAULT_SETTINGS.max_trades_per_day}, ${DEFAULT_SETTINGS.min_confidence_score},
      ${DEFAULT_SETTINGS.min_risk_reward}, ${DEFAULT_SETTINGS.max_risk_per_trade_pct},
      ${DEFAULT_SETTINGS.allowed_pairs}, ${DEFAULT_SETTINGS.allowed_timeframes},
      ${DEFAULT_SETTINGS.telegram_chat_id}
    )
    RETURNING *
  `;
  return created[0] as AgentSettings;
}

export async function updateAgentSettings(patch: NewAgentSettings): Promise<AgentSettings> {
  const current = await getAgentSettings();
  const rows = await sql`
    UPDATE agent_settings SET
      agent_mode             = ${patch.agent_mode             ?? current.agent_mode},
      kill_switch            = ${patch.kill_switch            ?? current.kill_switch},
      max_trades_per_day     = ${patch.max_trades_per_day     ?? current.max_trades_per_day},
      min_confidence_score   = ${patch.min_confidence_score   ?? current.min_confidence_score},
      min_risk_reward        = ${patch.min_risk_reward        ?? current.min_risk_reward},
      max_risk_per_trade_pct = ${patch.max_risk_per_trade_pct ?? current.max_risk_per_trade_pct},
      allowed_pairs          = ${patch.allowed_pairs          ?? current.allowed_pairs},
      allowed_timeframes     = ${patch.allowed_timeframes     ?? current.allowed_timeframes},
      telegram_chat_id       = ${patch.telegram_chat_id !== undefined ? patch.telegram_chat_id : current.telegram_chat_id},
      updated_at             = now()
    WHERE id = ${current.id}
    RETURNING *
  `;
  return rows[0] as AgentSettings;
}

export async function createAgentRun(data: {
  triggered_by: string;
  pairs_scanned: string[];
  candidates_found: number;
  trades_taken: number;
  error?: string | null;
  duration_ms?: number | null;
}): Promise<AgentRun> {
  const rows = await sql`
    INSERT INTO agent_runs (triggered_by, pairs_scanned, candidates_found, trades_taken, error, duration_ms)
    VALUES (
      ${data.triggered_by}, ${data.pairs_scanned}, ${data.candidates_found},
      ${data.trades_taken}, ${data.error ?? null}, ${data.duration_ms ?? null}
    )
    RETURNING *
  `;
  return rows[0] as AgentRun;
}

export async function listAgentRuns(limit = 20): Promise<AgentRun[]> {
  const rows = await sql`SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT ${limit}`;
  return rows as AgentRun[];
}

export async function createAgentCandidate(data: {
  run_id: string;
  pair: string;
  timeframe: string;
  direction?: string | null;
  setup_type?: string | null;
  confidence_score?: number | null;
  trade_status?: string | null;
  risk_reward?: number | null;
  entry_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  blockers?: string[];
  trigger_conditions?: string[];
  analysis_json?: unknown;
}): Promise<AgentCandidate> {
  const rows = await sql`
    INSERT INTO agent_candidates (
      run_id, pair, timeframe, direction, setup_type, confidence_score, trade_status,
      risk_reward, entry_price, stop_loss, take_profit, blockers, trigger_conditions, analysis_json
    ) VALUES (
      ${data.run_id}, ${data.pair}, ${data.timeframe},
      ${data.direction ?? null}, ${data.setup_type ?? null},
      ${data.confidence_score ?? null}, ${data.trade_status ?? null},
      ${data.risk_reward ?? null}, ${data.entry_price ?? null},
      ${data.stop_loss ?? null}, ${data.take_profit ?? null},
      ${data.blockers ?? []}, ${data.trigger_conditions ?? []},
      ${data.analysis_json ? JSON.stringify(data.analysis_json) : null}
    )
    RETURNING *
  `;
  return rows[0] as AgentCandidate;
}

export async function listAgentCandidates(limit = 50): Promise<AgentCandidate[]> {
  const rows = await sql`SELECT * FROM agent_candidates ORDER BY created_at DESC LIMIT ${limit}`;
  return rows as AgentCandidate[];
}

export async function getAgentCandidate(id: string): Promise<AgentCandidate | null> {
  const rows = await sql`SELECT * FROM agent_candidates WHERE id = ${id}`;
  return (rows[0] as AgentCandidate) ?? null;
}

export async function updateCandidateDecision(
  id: string,
  decision: CandidateDecision,
  opts: { reason?: string; telegram_message_id?: string; journal_entry_id?: string } = {}
): Promise<AgentCandidate | null> {
  const rows = await sql`
    UPDATE agent_candidates SET
      decision            = ${decision},
      decided_at          = now(),
      decision_reason     = COALESCE(${opts.reason ?? null}, decision_reason),
      telegram_message_id = COALESCE(${opts.telegram_message_id ?? null}, telegram_message_id),
      journal_entry_id    = COALESCE(${opts.journal_entry_id ?? null}, journal_entry_id)
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as AgentCandidate) ?? null;
}

export async function countTodayApprovedTrades(): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*) as count FROM agent_candidates
    WHERE decision = 'APPROVED'
      AND created_at >= CURRENT_DATE
      AND created_at < CURRENT_DATE + INTERVAL '1 day'
  `;
  return Number(rows[0]?.count ?? 0);
}
