export type OandaCandle = {
  complete: boolean;
  time: string;
  mid: { o: string; h: string; l: string; c: string };
};

export type ParsedCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export function parseCandles(candles: OandaCandle[]): ParsedCandle[] {
  return candles
    .filter((c) => c.complete)
    .map((c) => ({
      time: c.time,
      open: Number(c.mid.o),
      high: Number(c.mid.h),
      low: Number(c.mid.l),
      close: Number(c.mid.c),
    }));
}

export function getTrendBias(candles: ParsedCandle[]): string {
  const recent = candles.slice(-20);
  if (recent.length < 20) return "NEUTRAL";
  const change = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;
  if (change > 0.003) return "BULL";
  if (change < -0.003) return "BEAR";
  return "NEUTRAL";
}

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
  if (!last) {
    return { isValidSetup: false, score: 0, entry: null, stopLoss: null, takeProfit: null, riskReward: null, reason: "No completed candle available." };
  }

  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  if (range <= 0) {
    return { isValidSetup: false, score: 0, entry: null, stopLoss: null, takeProfit: null, riskReward: null, reason: "Invalid candle range." };
  }

  const bodyRatio = body / range;
  const upperWickRatio = upperWick / range;
  const lowerWickRatio = lowerWick / range;

  const isBearish = bias === "BEAR" && upperWickRatio >= 0.6 && bodyRatio <= 0.3;
  const isBullish = bias === "BULL" && lowerWickRatio >= 0.6 && bodyRatio <= 0.3;

  if (!isBearish && !isBullish) {
    return {
      isValidSetup: false,
      score: Math.round(Math.max(upperWickRatio, lowerWickRatio) * 50),
      entry: null, stopLoss: null, takeProfit: null, riskReward: null,
      reason: "No valid Kangaroo Tail on the latest completed candle.",
    };
  }

  const rr = 3;
  if (isBearish) {
    const entry = last.close;
    const stop = last.high;
    const risk = stop - entry;
    return { isValidSetup: true, score: 80, entry, stopLoss: stop, takeProfit: entry - risk * rr, riskReward: rr, reason: "Bearish Kangaroo Tail: long upper wick with bearish trend bias." };
  }

  const entry = last.close;
  const stop = last.low;
  const risk = entry - stop;
  return { isValidSetup: true, score: 80, entry, stopLoss: stop, takeProfit: entry + risk * rr, riskReward: rr, reason: "Bullish Kangaroo Tail: long lower wick with bullish trend bias." };
}

export function detectBigShadow(candles: ParsedCandle[]): boolean {
  if (candles.length < 2) return false;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const range = curr.high - curr.low;
  if (range <= 0) return false;
  const bodyRatio = Math.abs(curr.close - curr.open) / range;
  return curr.high > prev.high && curr.low < prev.low && bodyRatio >= 0.7;
}

export function detectInsideBar(candles: ParsedCandle[]): boolean {
  if (candles.length < 2) return false;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  return curr.high <= prev.high && curr.low >= prev.low;
}

export type KeyLevel = { price: number; type: "support" | "resistance" };

export function extractKeyLevels(candles: ParsedCandle[]): KeyLevel[] {
  const levels: KeyLevel[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    if (curr.high > prev.high && curr.high > next.high) levels.push({ price: curr.high, type: "resistance" });
    if (curr.low < prev.low && curr.low < next.low) levels.push({ price: curr.low, type: "support" });
  }
  const resistance = levels.filter((l) => l.type === "resistance").slice(-3);
  const support = levels.filter((l) => l.type === "support").slice(-3);
  return [...resistance, ...support];
}
