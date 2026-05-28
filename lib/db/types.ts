export type Direction = "LONG" | "SHORT";
export type Outcome = "WIN" | "LOSS" | "BE" | "OPEN" | "CANCELLED";

export type JournalEntry = {
  id: string;
  created_at: string;
  updated_at: string;

  pair: string;
  timeframe: string;
  direction: Direction;
  setup_type: string | null;
  bias: string | null;

  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  risk_reward: number | null;
  position_size: number | null;
  risk_pct: number | null;

  entered_at: string | null;
  exited_at: string | null;

  outcome: Outcome | null;
  exit_price: number | null;
  r_multiple: number | null;
  pnl: number | null;

  thesis_md: string | null;
  review_md: string | null;

  emotion_tags: string[];
  mistake_tags: string[];
  lesson_tags: string[];

  chart_urls: string[];
  candles_snapshot_json: unknown;

  ai_grade: string | null;
  ai_score: number | null;
  ai_review_md: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_cost_usd: number | null;

  source: string;
};

export type NewJournalEntry = {
  pair: string;
  timeframe: string;
  direction: Direction;
  setup_type?: string | null;
  bias?: string | null;
  entry_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  risk_reward?: number | null;
  position_size?: number | null;
  risk_pct?: number | null;
  entered_at?: string | null;
  thesis_md?: string | null;
  emotion_tags?: string[];
  chart_urls?: string[];
  source?: string;
};

export type UpdateJournalEntry = Partial<{
  exited_at: string | null;
  outcome: Outcome | null;
  exit_price: number | null;
  r_multiple: number | null;
  pnl: number | null;
  review_md: string | null;
  emotion_tags: string[];
  mistake_tags: string[];
  lesson_tags: string[];
  chart_urls: string[];
}>;

// ─── Agent types ──────────────────────────────────────────────────────────────

export type AgentMode = "OFF" | "ALERT_ONLY" | "APPROVAL_REQUIRED" | "DEMO_AUTO";
export type CandidateDecision = "PENDING" | "APPROVED" | "DENIED" | "JOURNAL_ONLY" | "AUTO_SKIPPED" | "EXPIRED";

export type AgentSettings = {
  id: string;
  created_at: string;
  updated_at: string;
  agent_mode: AgentMode;
  kill_switch: boolean;
  max_trades_per_day: number;
  min_confidence_score: number;
  min_risk_reward: number;
  max_risk_per_trade_pct: number;
  allowed_pairs: string[];
  allowed_timeframes: string[];
  telegram_chat_id: string | null;
  cooldown_after_losses: number;
  cooldown_hours: number;
  volatility_gate_enabled: boolean;
  max_adr_multiplier: number;
  news_blackout_enabled: boolean;
  news_blackout_minutes: number;
};

export type AgentRun = {
  id: string;
  created_at: string;
  triggered_by: string;
  pairs_scanned: string[];
  candidates_found: number;
  trades_taken: number;
  error: string | null;
  duration_ms: number | null;
};

export type AgentCandidate = {
  id: string;
  created_at: string;
  run_id: string;
  pair: string;
  timeframe: string;
  direction: Direction | null;
  setup_type: string | null;
  confidence_score: number | null;
  trade_status: string | null;
  risk_reward: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  blockers: string[];
  trigger_conditions: string[];
  analysis_json: unknown;
  decision: CandidateDecision;
  decided_at: string | null;
  decision_reason: string | null;
  telegram_message_id: string | null;
  journal_entry_id: string | null;
};

export type NewAgentSettings = Partial<Omit<AgentSettings, "id" | "created_at" | "updated_at">>;

export type AgentOrder = {
  id: string;
  created_at: string;
  candidate_id: string | null;
  journal_entry_id: string | null;
  pair: string;
  direction: Direction | null;
  oanda_account_id: string | null;
  oanda_order_id: string | null;
  oanda_trade_id: string | null;
  open_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: "OPEN" | "CLOSED" | "CANCELLED" | "ERROR";
  error: string | null;
  close_price: number | null;
  realized_pnl: number | null;
  closed_at: string | null;
  close_checked_at: string | null;
};
