// M15 precision entry — runs KT / Big Shadow detection on M15 candles
// using the H4 bias as direction context. Returns a tighter TradePlan
// when a confirming pattern exists on the lower timeframe.

import { detectKangarooTail, detectBigShadow } from "./patterns";
import { buildTradePlan } from "./planner";
import { calculateATR } from "./candles";
import type { ParsedCandle } from "./candles";
import type { TradePlan } from "./planner";

export type M15EntryResult = {
  found: boolean;
  setupType: string | null;
  entryPlan: TradePlan | null;
  note: string;
};

export function analyzeM15Entry(
  m15Candles: ParsedCandle[],
  h4Bias: string
): M15EntryResult {
  if (m15Candles.length < 10) {
    return { found: false, setupType: null, entryPlan: null, note: "Insufficient M15 candles" };
  }

  const atr14 = calculateATR(m15Candles, 14);

  const ktResult = detectKangarooTail(m15Candles, h4Bias);
  if (ktResult.isValidSetup) {
    const plan = buildTradePlan({
      setupDetected: true,
      setupType: "Kangaroo Tail",
      h4Bias,
      ktResult,
      candles: m15Candles,
      atr14,
    });
    return {
      found: true,
      setupType: "M15 Kangaroo Tail",
      entryPlan: plan,
      note: `M15 KT confirmed on ${h4Bias === "BULL" ? "bullish" : "bearish"} H4 bias — tighter entry available`,
    };
  }

  const bigShadow = detectBigShadow(m15Candles);
  if (bigShadow) {
    const plan = buildTradePlan({
      setupDetected: true,
      setupType: "Big Shadow",
      h4Bias,
      ktResult,
      candles: m15Candles,
      atr14,
    });
    return {
      found: true,
      setupType: "M15 Big Shadow",
      entryPlan: plan,
      note: "M15 Big Shadow confirmed — entry at M15 candle extreme",
    };
  }

  return {
    found: false,
    setupType: null,
    entryPlan: null,
    note: "No M15 pattern — wait for H4 entry trigger",
  };
}
