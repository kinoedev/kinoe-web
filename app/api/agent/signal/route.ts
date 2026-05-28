import { NextRequest, NextResponse } from "next/server";
import { parseCandles, runFullPairAnalysis } from "@/lib/signals/detection";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pair = searchParams.get("pair") ?? "EUR_USD";
    const apiKey = process.env.OANDA_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ ok: false, reason: "Missing OANDA_API_KEY" }, { status: 500 });
    }

    const baseUrl =
      (process.env.OANDA_ACCOUNT_TYPE ?? "practice") === "live"
        ? "https://api-fxtrade.oanda.com"
        : "https://api-fxpractice.oanda.com";

    const [h4Res, d1Res] = await Promise.all([
      fetch(`${baseUrl}/v3/instruments/${pair}/candles?granularity=H4&count=100&price=M`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        cache: "no-store",
      }),
      fetch(`${baseUrl}/v3/instruments/${pair}/candles?granularity=D&count=50&price=M`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        cache: "no-store",
      }),
    ]);

    const [h4Data, d1Data] = await Promise.all([h4Res.json(), d1Res.json()]);
    const h4Candles = parseCandles(h4Data.candles ?? []);
    const d1Candles = parseCandles(d1Data.candles ?? []);

    const result = runFullPairAnalysis(pair, h4Candles, d1Candles);

    const plan = result.potentialTradePlan;
    return NextResponse.json({
      ok: true,
      pair: result.pair,
      timeframe: "H4",
      bias: `${result.higherTimeframeBias} / ${result.executionTimeframeBias}`,
      setup: result.setupType ?? "No setup",
      isValidSetup: result.tradeStatus === "TRADE_READY",
      score: result.confidenceScore,
      entry: plan?.entryTrigger ?? null,
      stopLoss: plan?.stopLoss ?? null,
      takeProfit: plan?.takeProfit ?? null,
      riskReward: plan?.riskReward ?? null,
      reason: result.blockers.length > 0
        ? result.blockers.join(" · ")
        : result.triggerConditions.join(" · ") || "Rule engine analysis complete.",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}
