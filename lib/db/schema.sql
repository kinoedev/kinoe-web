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
