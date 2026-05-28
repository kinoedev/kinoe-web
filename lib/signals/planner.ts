import type { ParsedCandle } from "./candles";
import type { KTResult } from "./patterns";

export type TradePlan = {
  direction: "LONG" | "SHORT";
  entryTrigger: string;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  riskPips: number;
  invalidation: string;
};

export function buildTradePlan({
  setupDetected, setupType, h4Bias, ktResult, candles, atr14,
}: {
  setupDetected: boolean;
  setupType: string | null;
  h4Bias: string;
  ktResult: KTResult;
  candles: ParsedCandle[];
  atr14?: number;
}): TradePlan | null {
  if (!setupDetected) return null;

  const last = candles[candles.length - 1];
  // ATR buffer widens the SL beyond the candle extreme to avoid noise stop-outs.
  // 0.3x ATR is conservative — gives the trade room without skewing R:R much.
  const buffer = (atr14 ?? 0) * 0.3;

  if (setupType === "Kangaroo Tail" && ktResult.entry !== null && ktResult.stopLoss !== null) {
    const dir = h4Bias === "BULL" ? "LONG" : "SHORT";
    const entry = ktResult.entry;

    const sl =
      dir === "LONG"
        ? Number((ktResult.stopLoss - buffer).toFixed(5))
        : Number((ktResult.stopLoss + buffer).toFixed(5));

    const risk = Math.abs(entry - sl);
    const rr = 3;
    const tp = dir === "LONG"
      ? Number((entry + risk * rr).toFixed(5))
      : Number((entry - risk * rr).toFixed(5));

    const pipMultiplier = last.close > 10 ? 100 : 10000;
    const riskPips = Math.round(risk * pipMultiplier);

    return {
      direction: dir,
      entryTrigger: dir === "LONG" ? `Buy stop at KT high ${entry}` : `Sell stop at KT low ${entry}`,
      stopLoss: sl,
      takeProfit: tp,
      riskReward: rr,
      riskPips,
      invalidation: dir === "LONG"
        ? `H4 close below KT low ${sl}`
        : `H4 close above KT high ${sl}`,
    };
  }

  if (setupType === "Big Shadow") {
    const isBull = last.close > last.open;
    const dir = isBull ? "LONG" : "SHORT";
    const entry = isBull ? last.high : last.low;

    const rawStop = isBull ? last.low : last.high;
    const sl = isBull
      ? Number((rawStop - buffer).toFixed(5))
      : Number((rawStop + buffer).toFixed(5));

    const risk = Math.abs(entry - sl);
    const rr = 3;
    const tp = isBull
      ? Number((entry + risk * rr).toFixed(5))
      : Number((entry - risk * rr).toFixed(5));

    const pipMultiplier = last.close > 10 ? 100 : 10000;
    const riskPips = Math.round(risk * pipMultiplier);

    return {
      direction: dir,
      entryTrigger: `${dir === "LONG" ? "Buy stop" : "Sell stop"} at Big Shadow ${dir === "LONG" ? "high" : "low"} ${entry}`,
      stopLoss: sl,
      takeProfit: tp,
      riskReward: rr,
      riskPips,
      invalidation: `Candle closes ${dir === "LONG" ? "below" : "above"} Big Shadow body midpoint`,
    };
  }

  if (setupType === "Inside Bar") {
    const mother = candles[candles.length - 2];
    const dir = h4Bias === "BULL" ? "LONG" : "SHORT";

    const entry = dir === "LONG"
      ? Number(mother.high.toFixed(5))
      : Number(mother.low.toFixed(5));

    const rawStop = dir === "LONG" ? mother.low : mother.high;
    const sl = dir === "LONG"
      ? Number((rawStop - buffer).toFixed(5))
      : Number((rawStop + buffer).toFixed(5));

    const risk = Math.abs(entry - sl);
    const rr = 2;
    const tp = dir === "LONG"
      ? Number((entry + risk * rr).toFixed(5))
      : Number((entry - risk * rr).toFixed(5));

    const pipMultiplier = mother.close > 10 ? 100 : 10000;
    const riskPips = Math.round(risk * pipMultiplier);

    return {
      direction: dir,
      entryTrigger: `${dir === "LONG" ? "Buy stop" : "Sell stop"} above mother bar ${dir === "LONG" ? "high" : "low"} ${entry}`,
      stopLoss: sl,
      takeProfit: tp,
      riskReward: rr,
      riskPips,
      invalidation: `Mother bar ${dir === "LONG" ? "low" : "high"} breaks — IB pattern void`,
    };
  }

  return null;
}
