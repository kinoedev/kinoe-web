import type { ParsedCandle } from "./candles";

export type SwingPoint = {
  type: "high" | "low";
  price: number;
  index: number;
};

export type StructureAnalysis = {
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  lastHL: SwingPoint | null;
  lastLH: SwingPoint | null;
  nearStructuralZone: boolean;
  note: string;
};

// Find swing highs and lows using N-candle confirmation on each side.
// lookback=3 means price must be the highest/lowest in a 7-candle window.
function findSignificantSwings(
  candles: ParsedCandle[],
  lookback = 3
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) isHigh = false;
      if (candles[i - j].low  <= c.low  || candles[i + j].low  <= c.low)  isLow  = false;
    }

    if (isHigh) highs.push({ type: "high", price: c.high, index: i });
    if (isLow)  lows.push({  type: "low",  price: c.low,  index: i });
  }

  return { highs, lows };
}

export function analyzeMarketStructure(candles: ParsedCandle[]): StructureAnalysis {
  const currentPrice = candles[candles.length - 1].close;
  const { highs, lows } = findSignificantSwings(candles, 3);

  const recentHighs = highs.slice(-5);
  const recentLows  = lows.slice(-5);

  if (recentHighs.length < 2 || recentLows.length < 2) {
    return { bias: "NEUTRAL", lastHL: null, lastLH: null, nearStructuralZone: false, note: "Insufficient swing data for structure" };
  }

  // Count Higher Highs (each high > previous high)
  const hhCount = recentHighs.slice(1).filter((h, i) => h.price > recentHighs[i].price).length;
  // Count Higher Lows (each low > previous low)
  const hlCount = recentLows.slice(1).filter((l, i) => l.price > recentLows[i].price).length;
  // Count Lower Highs
  const lhCount = recentHighs.slice(1).filter((h, i) => h.price < recentHighs[i].price).length;
  // Count Lower Lows
  const llCount = recentLows.slice(1).filter((l, i) => l.price < recentLows[i].price).length;

  const bullScore = hhCount + hlCount;
  const bearScore = lhCount + llCount;
  const maxScore  = (recentHighs.length - 1) + (recentLows.length - 1);

  let bias: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let lastHL: SwingPoint | null = null;
  let lastLH: SwingPoint | null = null;

  if (bullScore >= maxScore * 0.6 && bullScore > bearScore) {
    bias = "BULLISH";
    // Most recent low that is higher than the one before it = last HL
    for (let i = recentLows.length - 1; i >= 1; i--) {
      if (recentLows[i].price > recentLows[i - 1].price) {
        lastHL = recentLows[i];
        break;
      }
    }
    if (!lastHL) lastHL = recentLows[recentLows.length - 1];
  } else if (bearScore >= maxScore * 0.6 && bearScore > bullScore) {
    bias = "BEARISH";
    // Most recent high that is lower than the one before it = last LH
    for (let i = recentHighs.length - 1; i >= 1; i--) {
      if (recentHighs[i].price < recentHighs[i - 1].price) {
        lastLH = recentHighs[i];
        break;
      }
    }
    if (!lastLH) lastLH = recentHighs[recentHighs.length - 1];
  }

  // Is current price near the structural zone (HL for longs, LH for shorts)?
  let nearStructuralZone = false;
  let note: string;

  const ZONE_TOLERANCE = 0.005; // 0.5% of price

  if (bias === "BULLISH" && lastHL) {
    const dist = Math.abs(currentPrice - lastHL.price) / currentPrice;
    nearStructuralZone = dist <= ZONE_TOLERANCE;
    note = `Bullish structure (HH+HL) — last HL at ${lastHL.price.toFixed(5)}${nearStructuralZone ? " — price in zone" : ""}`;
  } else if (bias === "BEARISH" && lastLH) {
    const dist = Math.abs(currentPrice - lastLH.price) / currentPrice;
    nearStructuralZone = dist <= ZONE_TOLERANCE;
    note = `Bearish structure (LH+LL) — last LH at ${lastLH.price.toFixed(5)}${nearStructuralZone ? " — price in zone" : ""}`;
  } else {
    note = "Choppy / no clear structure";
  }

  return { bias, lastHL, lastLH, nearStructuralZone, note };
}
