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
