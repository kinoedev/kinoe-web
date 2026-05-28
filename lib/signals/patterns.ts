import type { ParsedCandle } from "./candles";

export type KTResult = {
  isValidSetup: boolean;
  score: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  reason: string;
};

export function detectKangarooTail(candles: ParsedCandle[], bias: string): KTResult {
  const last = candles[candles.length - 1];
  if (!last) return { isValidSetup: false, score: 0, entry: null, stopLoss: null, takeProfit: null, riskReward: null, reason: "No candle." };

  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const midpoint = (last.high + last.low) / 2;

  if (range <= 0) return { isValidSetup: false, score: 0, entry: null, stopLoss: null, takeProfit: null, riskReward: null, reason: "Invalid range." };

  const bodyRatio = body / range;
  const upperWickRatio = upperWick / range;
  const lowerWickRatio = lowerWick / range;

  // 50% body rule: close must land in the correct half — confirms the rejection was genuine
  const isBearish = bias === "BEAR" && upperWickRatio >= 0.6 && bodyRatio <= 0.3 && last.close <= midpoint;
  const isBullish = bias === "BULL" && lowerWickRatio >= 0.6 && bodyRatio <= 0.3 && last.close >= midpoint;

  if (!isBearish && !isBullish) {
    // Partial KT score for near-misses (informational)
    const partialScore = Math.round(Math.max(upperWickRatio, lowerWickRatio) * 50);
    const reason = (upperWickRatio >= 0.6 || lowerWickRatio >= 0.6)
      ? "KT wick present but failed 50% body rule — weak rejection."
      : "No valid KT on latest candle.";
    return { isValidSetup: false, score: partialScore, entry: null, stopLoss: null, takeProfit: null, riskReward: null, reason };
  }

  const rr = 3;
  if (isBearish) {
    const entry = last.close;
    const stop = last.high;
    return { isValidSetup: true, score: 80, entry, stopLoss: stop, takeProfit: entry - (stop - entry) * rr, riskReward: rr, reason: "Bearish KT: long upper wick, close in lower half, bearish bias." };
  }
  const entry = last.close;
  const stop = last.low;
  return { isValidSetup: true, score: 80, entry, stopLoss: stop, takeProfit: entry + (entry - stop) * rr, riskReward: rr, reason: "Bullish KT: long lower wick, close in upper half, bullish bias." };
}

export function detectBigShadow(candles: ParsedCandle[]): boolean {
  if (candles.length < 2) return false;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const range = curr.high - curr.low;
  if (range <= 0) return false;

  const midpoint = (curr.high + curr.low) / 2;
  const bodyPct = Math.abs(curr.close - curr.open) / range;

  // 50% rule: bullish BS close in upper half, bearish BS close in lower half
  const isBullClose = curr.close > curr.open && curr.close >= midpoint;
  const isBearClose = curr.close < curr.open && curr.close <= midpoint;

  return (
    curr.high > prev.high &&
    curr.low < prev.low &&
    bodyPct >= 0.7 &&
    (isBullClose || isBearClose)
  );
}

export function detectInsideBar(candles: ParsedCandle[]): boolean {
  if (candles.length < 2) return false;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  return curr.high <= prev.high && curr.low >= prev.low;
}
