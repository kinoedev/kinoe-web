/** One OHLCV bar. `ts` is the bar's open time in epoch milliseconds (UTC). */
export type Bar = {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** Databento OHLCV schemas Kinoe uses. */
export type BarSchema = "ohlcv-1m" | "ohlcv-1h";

export const SCHEMA_MS: Record<BarSchema, number> = {
  "ohlcv-1m": 60_000,
  "ohlcv-1h": 3_600_000,
};
