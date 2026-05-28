import { sql } from "./client";
import type {
  JournalEntry, NewJournalEntry, UpdateJournalEntry,
  AgentSettings, NewAgentSettings, AgentRun, AgentCandidate, CandidateDecision,
  AgentOrder,
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
  max_risk_per_trade_pct: 0.01,
  allowed_pairs: ["EUR_USD", "GBP_USD", "XAU_USD"],
  allowed_timeframes: ["H4"],
  telegram_chat_id: null,
  cooldown_after_losses: 3,
  cooldown_hours: 24,
  volatility_gate_enabled: false,
  max_adr_multiplier: 2.5,
  news_blackout_enabled: false,
  news_blackout_minutes: 60,
  scan_sessions: ["london", "new_york"],
};

export async function getAgentSettings(): Promise<AgentSettings> {
  const rows = await sql`SELECT * FROM agent_settings ORDER BY created_at ASC LIMIT 1`;
  if (rows.length > 0) return rows[0] as AgentSettings;

  const created = await sql`
    INSERT INTO agent_settings (
      agent_mode, kill_switch, max_trades_per_day, min_confidence_score,
      min_risk_reward, max_risk_per_trade_pct, allowed_pairs, allowed_timeframes,
      telegram_chat_id, cooldown_after_losses, cooldown_hours,
      volatility_gate_enabled, max_adr_multiplier,
      news_blackout_enabled, news_blackout_minutes, scan_sessions
    ) VALUES (
      ${DEFAULT_SETTINGS.agent_mode}, ${DEFAULT_SETTINGS.kill_switch},
      ${DEFAULT_SETTINGS.max_trades_per_day}, ${DEFAULT_SETTINGS.min_confidence_score},
      ${DEFAULT_SETTINGS.min_risk_reward}, ${DEFAULT_SETTINGS.max_risk_per_trade_pct},
      ${DEFAULT_SETTINGS.allowed_pairs}, ${DEFAULT_SETTINGS.allowed_timeframes},
      ${DEFAULT_SETTINGS.telegram_chat_id},
      ${DEFAULT_SETTINGS.cooldown_after_losses}, ${DEFAULT_SETTINGS.cooldown_hours},
      ${DEFAULT_SETTINGS.volatility_gate_enabled}, ${DEFAULT_SETTINGS.max_adr_multiplier},
      ${DEFAULT_SETTINGS.news_blackout_enabled}, ${DEFAULT_SETTINGS.news_blackout_minutes},
      ${DEFAULT_SETTINGS.scan_sessions}
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
      allowed_timeframes      = ${patch.allowed_timeframes      ?? current.allowed_timeframes},
      telegram_chat_id        = ${patch.telegram_chat_id !== undefined ? patch.telegram_chat_id : current.telegram_chat_id},
      cooldown_after_losses   = ${patch.cooldown_after_losses   ?? current.cooldown_after_losses},
      cooldown_hours          = ${patch.cooldown_hours          ?? current.cooldown_hours},
      volatility_gate_enabled = ${patch.volatility_gate_enabled ?? current.volatility_gate_enabled},
      max_adr_multiplier      = ${patch.max_adr_multiplier      ?? current.max_adr_multiplier},
      news_blackout_enabled   = ${patch.news_blackout_enabled   ?? current.news_blackout_enabled},
      news_blackout_minutes   = ${patch.news_blackout_minutes   ?? current.news_blackout_minutes},
      scan_sessions           = ${patch.scan_sessions           ?? current.scan_sessions},
      updated_at              = now()
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

// ─── Agent order queries ──────────────────────────────────────────────────────

export async function createAgentOrder(data: {
  candidate_id?: string;
  journal_entry_id?: string;
  pair: string;
  direction?: string | null;
  oanda_account_id?: string | null;
  open_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
}): Promise<AgentOrder> {
  const rows = await sql`
    INSERT INTO agent_orders (
      candidate_id, journal_entry_id, pair, direction,
      oanda_account_id, open_price, stop_loss, take_profit, status
    ) VALUES (
      ${data.candidate_id ?? null}, ${data.journal_entry_id ?? null},
      ${data.pair}, ${data.direction ?? null},
      ${data.oanda_account_id ?? null},
      ${data.open_price ?? null}, ${data.stop_loss ?? null}, ${data.take_profit ?? null},
      'OPEN'
    )
    RETURNING *
  `;
  return rows[0] as AgentOrder;
}

export async function listOpenAgentOrders(): Promise<AgentOrder[]> {
  const rows = await sql`
    SELECT * FROM agent_orders WHERE status = 'OPEN' ORDER BY created_at ASC
  `;
  return rows as AgentOrder[];
}

export async function closeAgentOrder(
  id: string,
  data: { close_price: number; realized_pnl: number; closed_at: string; oanda_trade_id?: string }
): Promise<AgentOrder | null> {
  const rows = await sql`
    UPDATE agent_orders SET
      status           = 'CLOSED',
      close_price      = ${data.close_price},
      realized_pnl     = ${data.realized_pnl},
      closed_at        = ${data.closed_at},
      close_checked_at = now(),
      oanda_trade_id   = COALESCE(${data.oanda_trade_id ?? null}, oanda_trade_id)
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as AgentOrder) ?? null;
}

export async function stampOrderCloseChecked(id: string): Promise<void> {
  await sql`UPDATE agent_orders SET close_checked_at = now() WHERE id = ${id}`;
}

export async function listOpenAgentJournalEntries(): Promise<JournalEntry[]> {
  const rows = await sql`
    SELECT * FROM journal_entries
    WHERE source = 'agent' AND (outcome = 'OPEN' OR outcome IS NULL)
    ORDER BY entered_at ASC NULLS LAST
  `;
  return rows as JournalEntry[];
}

export async function closeJournalEntry(
  id: string,
  data: { exit_price: number; realized_pnl: number; r_multiple: number; outcome: "WIN" | "LOSS" | "BE"; exited_at: string }
): Promise<JournalEntry | null> {
  const rows = await sql`
    UPDATE journal_entries SET
      exit_price = ${data.exit_price},
      pnl        = ${data.realized_pnl},
      r_multiple = ${data.r_multiple},
      outcome    = ${data.outcome},
      exited_at  = ${data.exited_at},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as JournalEntry) ?? null;
}

export async function getTrailingConsecutiveLosses(): Promise<{
  count: number;
  lastLossAt: string | null;
}> {
  const rows = await sql`
    SELECT outcome, exited_at FROM journal_entries
    WHERE outcome IN ('WIN','LOSS','BE')
    ORDER BY exited_at DESC NULLS LAST
    LIMIT 10
  `;
  let count = 0;
  let lastLossAt: string | null = null;
  for (const row of rows as { outcome: string; exited_at: string | null }[]) {
    if (row.outcome === "LOSS") {
      count++;
      if (!lastLossAt) lastLossAt = row.exited_at;
    } else {
      break;
    }
  }
  return { count, lastLossAt };
}
