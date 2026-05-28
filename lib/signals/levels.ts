import type { ParsedCandle } from "./candles";

export type KeyLevel = { price: number; type: "support" | "resistance" };

export type KeyLevelDetailed = {
  type: "support" | "resistance";
  price: number;
  strengthScore: number;
  reason: string;
};

export function extractKeyLevels(candles: ParsedCandle[]): KeyLevel[] {
  const levels: KeyLevel[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high)
      levels.push({ price: candles[i].high, type: "resistance" });
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low)
      levels.push({ price: candles[i].low, type: "support" });
  }
  return [...levels.filter((l) => l.type === "resistance").slice(-3), ...levels.filter((l) => l.type === "support").slice(-3)];
}

export function extractKeyLevelsDetailed(candles: ParsedCandle[]): KeyLevelDetailed[] {
  type Raw = KeyLevelDetailed & { idx: number };
  const raw: Raw[] = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    if (curr.high > prev.high && curr.high > next.high)
      raw.push({ type: "resistance", price: curr.high, strengthScore: 0, reason: "", idx: i });
    if (curr.low < prev.low && curr.low < next.low)
      raw.push({ type: "support", price: curr.low, strengthScore: 0, reason: "", idx: i });
  }

  const currentPrice = candles[candles.length - 1].close;

  const scored = raw.map((level) => {
    let score = 40;
    const reasons: string[] = [];
    const tolerance = level.price * 0.0015;

    let touches = 0;
    for (const c of candles) {
      const val = level.type === "resistance" ? c.high : c.low;
      if (Math.abs(val - level.price) <= tolerance) touches++;
    }
    if (touches >= 3) { score += 25; reasons.push(`tested ${touches}x`); }
    else if (touches >= 2) { score += 12; reasons.push(`tested ${touches}x`); }

    const candlesAgo = candles.length - 1 - level.idx;
    if (candlesAgo <= 10) { score += 20; reasons.push("very recent"); }
    else if (candlesAgo <= 30) { score += 10; reasons.push("recent"); }

    const p = level.price;
    const isRound = p % 0.01 < 0.001 || p % 0.005 < 0.0005 || p % 100 < 1 || p % 50 < 0.5;
    if (isRound) { score += 15; reasons.push("round number"); }

    return {
      type: level.type,
      price: Number(level.price.toFixed(5)),
      strengthScore: Math.min(score, 100),
      reason: reasons.length ? reasons.join(", ") : `swing ${level.type === "resistance" ? "high" : "low"}`,
      idx: level.idx,
    };
  });

  return scored
    .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))
    .slice(0, 6)
    .map(({ idx: _i, ...rest }) => rest);
}

export function calculateMarketState(
  h4Bias: string,
  d1Bias: string,
  candles: ParsedCandle[],
  keyLevels: KeyLevelDetailed[]
): "TRENDING" | "RANGING" | "BREAKOUT" | "REVERSAL" {
  const currentPrice = candles[candles.length - 1].close;

  const recentBreakout = keyLevels.some((l) => {
    const dist = Math.abs(l.price - currentPrice) / currentPrice;
    return dist < 0.002;
  });
  if (recentBreakout && h4Bias !== "NEUTRAL") return "BREAKOUT";

  if (h4Bias !== "NEUTRAL" && d1Bias !== "NEUTRAL" && h4Bias !== d1Bias) return "REVERSAL";
  if (h4Bias !== "NEUTRAL" && (d1Bias === h4Bias || d1Bias === "NEUTRAL")) return "TRENDING";
  return "RANGING";
}

export function calculateADR(d1Candles: ParsedCandle[], lookback = 14): number {
  const recent = d1Candles.slice(-lookback);
  if (recent.length < 3) return 0;
  const ranges = recent.map((c) => c.high - c.low);
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

export type ClearPathResult = {
  clear: boolean;
  blockingLevel: KeyLevelDetailed | null;
  reason: string | null;
};

export function checkClearPath(
  direction: "LONG" | "SHORT",
  entry: number,
  takeProfit: number,
  stopLoss: number,
  keyLevels: KeyLevelDetailed[]
): ClearPathResult {
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return { clear: true, blockingLevel: null, reason: null };

  const blocking = keyLevels.filter((l) => {
    const inPath =
      direction === "LONG"
        ? l.type === "resistance" && l.price > entry && l.price < takeProfit
        : l.type === "support"   && l.price < entry && l.price > takeProfit;

    // Only flag if it's within 1R of entry — beyond that it's just context
    const withinOneR = Math.abs(l.price - entry) < risk;

    return inPath && withinOneR && l.strengthScore >= 60;
  });

  const strongest = [...blocking].sort((a, b) => b.strengthScore - a.strengthScore)[0] ?? null;

  return {
    clear: blocking.length === 0,
    blockingLevel: strongest,
    reason: strongest
      ? `${strongest.type} at ${strongest.price.toFixed(5)} (str ${strongest.strengthScore}) blocking path within 1R`
      : null,
  };
}
