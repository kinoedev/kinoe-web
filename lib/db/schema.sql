-- Journal entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  pair            TEXT NOT NULL,
  timeframe       TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('LONG','SHORT')),
  setup_type      TEXT,
  bias            TEXT,

  entry_price     NUMERIC(18,8),
  stop_loss       NUMERIC(18,8),
  take_profit     NUMERIC(18,8),
  risk_reward     NUMERIC(8,2),
  position_size   NUMERIC(18,4),
  risk_pct        NUMERIC(6,4),

  entered_at      TIMESTAMPTZ,
  exited_at       TIMESTAMPTZ,

  outcome         TEXT CHECK (outcome IN ('WIN','LOSS','BE','OPEN','CANCELLED')),
  exit_price      NUMERIC(18,8),
  r_multiple      NUMERIC(8,2),
  pnl             NUMERIC(18,4),

  thesis_md       TEXT,
  review_md       TEXT,

  emotion_tags    TEXT[] NOT NULL DEFAULT '{}',
  mistake_tags    TEXT[] NOT NULL DEFAULT '{}',
  lesson_tags     TEXT[] NOT NULL DEFAULT '{}',

  chart_urls            TEXT[] NOT NULL DEFAULT '{}',
  candles_snapshot_json JSONB,

  ai_grade        TEXT,
  ai_score        INT,
  ai_review_md    TEXT,
  ai_provider     TEXT,
  ai_model        TEXT,
  ai_cost_usd     NUMERIC(10,6),

  source          TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS journal_entries_created_at_idx ON journal_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS journal_entries_pair_idx       ON journal_entries(pair);
CREATE INDEX IF NOT EXISTS journal_entries_outcome_idx    ON journal_entries(outcome);

-- Backtest runs
CREATE TABLE IF NOT EXISTS backtests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  pair          TEXT NOT NULL,
  timeframe     TEXT NOT NULL,
  strategy      TEXT NOT NULL,
  window_start  TIMESTAMPTZ,
  window_end    TIMESTAMPTZ,
  params_jsonb  JSONB,
  trades_jsonb  JSONB,
  trades_count  INT,
  wins          INT,
  losses        INT,
  win_rate      NUMERIC(6,4),
  avg_r         NUMERIC(8,4),
  notes_md      TEXT
);

CREATE INDEX IF NOT EXISTS backtests_created_at_idx ON backtests(created_at DESC);
CREATE INDEX IF NOT EXISTS backtests_pair_strategy_idx ON backtests(pair, strategy);

-- Audit log of every AI call for re-analysis and bot training
CREATE TABLE IF NOT EXISTS ai_analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_id      UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  backtest_id   UUID REFERENCES backtests(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  prompt_md     TEXT NOT NULL,
  response_md   TEXT NOT NULL,
  response_json JSONB,
  input_tokens  INT,
  output_tokens INT,
  cost_usd      NUMERIC(10,6)
);

CREATE INDEX IF NOT EXISTS ai_analyses_entry_id_idx    ON ai_analyses(entry_id);
CREATE INDEX IF NOT EXISTS ai_analyses_backtest_id_idx ON ai_analyses(backtest_id);

-- ─── Agent system ─────────────────────────────────────────────────────────────

-- Single-row settings table (upserted on save)
CREATE TABLE IF NOT EXISTS agent_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  agent_mode              TEXT NOT NULL DEFAULT 'OFF'
                            CHECK (agent_mode IN ('OFF','ALERT_ONLY','APPROVAL_REQUIRED','DEMO_AUTO')),
  kill_switch             BOOLEAN NOT NULL DEFAULT false,

  max_trades_per_day      INT NOT NULL DEFAULT 3,
  min_confidence_score    INT NOT NULL DEFAULT 75,
  min_risk_reward         NUMERIC(4,1) NOT NULL DEFAULT 3.0,
  max_risk_per_trade_pct  NUMERIC(4,2) NOT NULL DEFAULT 0.25,

  allowed_pairs           TEXT[] NOT NULL DEFAULT '{EUR_USD,GBP_USD,XAU_USD}',
  allowed_timeframes      TEXT[] NOT NULL DEFAULT '{H4}',

  telegram_chat_id        TEXT,

  cooldown_after_losses   INT NOT NULL DEFAULT 3,
  cooldown_hours          INT NOT NULL DEFAULT 24,
  volatility_gate_enabled BOOLEAN NOT NULL DEFAULT false,
  max_adr_multiplier      NUMERIC(4,2) NOT NULL DEFAULT 2.5,
  news_blackout_enabled   BOOLEAN NOT NULL DEFAULT false,
  news_blackout_minutes   INT NOT NULL DEFAULT 60
);

-- Add risk columns to existing installs (idempotent)
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS cooldown_after_losses   INT NOT NULL DEFAULT 3;
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS cooldown_hours          INT NOT NULL DEFAULT 24;
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS volatility_gate_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS max_adr_multiplier      NUMERIC(4,2) NOT NULL DEFAULT 2.5;
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS news_blackout_enabled   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS news_blackout_minutes   INT NOT NULL DEFAULT 60;

-- One row per scanner run (manual or scheduled)
CREATE TABLE IF NOT EXISTS agent_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_by    TEXT NOT NULL DEFAULT 'manual',
  pairs_scanned   TEXT[] NOT NULL DEFAULT '{}',
  candidates_found INT NOT NULL DEFAULT 0,
  trades_taken    INT NOT NULL DEFAULT 0,
  error           TEXT,
  duration_ms     INT
);

CREATE INDEX IF NOT EXISTS agent_runs_created_at_idx ON agent_runs(created_at DESC);

-- Every setup the agent considered during a run
CREATE TABLE IF NOT EXISTS agent_candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_id          UUID REFERENCES agent_runs(id) ON DELETE CASCADE,

  pair            TEXT NOT NULL,
  timeframe       TEXT NOT NULL,
  direction       TEXT CHECK (direction IN ('LONG','SHORT')),
  setup_type      TEXT,
  confidence_score INT,
  trade_status    TEXT,
  risk_reward     NUMERIC(8,2),
  entry_price     NUMERIC(18,8),
  stop_loss       NUMERIC(18,8),
  take_profit     NUMERIC(18,8),
  blockers        TEXT[] NOT NULL DEFAULT '{}',
  trigger_conditions TEXT[] NOT NULL DEFAULT '{}',

  analysis_json   JSONB,

  decision        TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (decision IN ('PENDING','APPROVED','DENIED','JOURNAL_ONLY','AUTO_SKIPPED','EXPIRED')),
  decided_at      TIMESTAMPTZ,
  decision_reason TEXT,

  telegram_message_id TEXT,
  journal_entry_id    UUID REFERENCES journal_entries(id)
);

CREATE INDEX IF NOT EXISTS agent_candidates_run_id_idx     ON agent_candidates(run_id);
CREATE INDEX IF NOT EXISTS agent_candidates_created_at_idx ON agent_candidates(created_at DESC);
CREATE INDEX IF NOT EXISTS agent_candidates_decision_idx   ON agent_candidates(decision);

-- Audit trail for every approve/deny decision
CREATE TABLE IF NOT EXISTS agent_decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  candidate_id    UUID REFERENCES agent_candidates(id) ON DELETE CASCADE,
  decision        TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'telegram',
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS agent_decisions_candidate_id_idx ON agent_decisions(candidate_id);

-- OANDA order tracking — one row per approved candidate
CREATE TABLE IF NOT EXISTS agent_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  candidate_id     UUID REFERENCES agent_candidates(id),
  journal_entry_id UUID REFERENCES journal_entries(id),

  pair             TEXT NOT NULL,
  direction        TEXT,
  oanda_account_id TEXT,
  oanda_order_id   TEXT,
  oanda_trade_id   TEXT,

  open_price       NUMERIC(18,8),
  stop_loss        NUMERIC(18,8),
  take_profit      NUMERIC(18,8),

  status           TEXT NOT NULL DEFAULT 'OPEN'
                     CHECK (status IN ('OPEN','CLOSED','CANCELLED','ERROR')),
  error            TEXT,

  close_price      NUMERIC(18,8),
  realized_pnl     NUMERIC(18,4),
  closed_at        TIMESTAMPTZ,
  close_checked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_orders_candidate_id_idx ON agent_orders(candidate_id);
CREATE INDEX IF NOT EXISTS agent_orders_status_idx       ON agent_orders(status);

-- Idempotent migration for existing installs
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS pair             TEXT;
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS direction        TEXT;
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS oanda_account_id TEXT;
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS open_price       NUMERIC(18,8);
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS stop_loss        NUMERIC(18,8);
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS take_profit      NUMERIC(18,8);
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS close_price      NUMERIC(18,8);
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS realized_pnl     NUMERIC(18,4);
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS closed_at        TIMESTAMPTZ;
ALTER TABLE agent_orders ADD COLUMN IF NOT EXISTS close_checked_at TIMESTAMPTZ;

-- Telegram chat subscriptions
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  type        TEXT NOT NULL DEFAULT 'telegram',
  identifier  TEXT NOT NULL UNIQUE,
  active      BOOLEAN NOT NULL DEFAULT true
);
