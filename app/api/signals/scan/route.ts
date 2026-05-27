import { NextResponse } from "next/server";
import { parseCandles, runFullPairAnalysis } from "@/lib/signals/detection";
import { summariseWithAI } from "@/lib/ai/scanner";
import type { PairAnalysisResult } from "@/lib/signals/detection";

const PAIRS = ["EUR_USD", "GBP_USD", "XAU_USD"];

export async function POST() {
  try {
    const apiKey = process.env.OANDA_API_KEY;
    const accountType = process.env.OANDA_ACCOUNT_TYPE || "practice";
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing OANDA_API_KEY" }, { status: 500 });
    }

    const baseUrl =
      accountType === "live"
        ? "https://api-fxtrade.oanda.com"
        : "https://api-fxpractice.oanda.com";

    // Step 1: Fetch candles + run rule engine for all pairs
    const analyses: PairAnalysisResult[] = await Promise.all(
      PAIRS.map(async (pair) => {
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
        const h4Candles = parseCandles(h4Data.candles || []);
        const d1Candles = parseCandles(d1Data.candles || []);

        return runFullPairAnalysis(pair, h4Candles, d1Candles);
      })
    );

    // Step 2: AI summaries only — no invented values
    const aiResult = await summariseWithAI(analyses);

    // Step 3: Merge AI summaries into analysis results
    const summaryMap = Object.fromEntries(
      aiResult.output.pairs.map((p) => [p.pair, p.aiSummary])
    );

    const mergedPairs = analyses.map((a) => ({
      ...a,
      aiSummary: summaryMap[a.pair] ?? "",
    }));

    return NextResponse.json({
      ok: true,
      scanned_at: new Date().toISOString(),
      overallSummary: aiResult.output.overallSummary,
      pairs: mergedPairs,
      meta: {
        model: aiResult.model,
        cost_usd: aiResult.cost_usd,
        input_tokens: aiResult.input_tokens,
        output_tokens: aiResult.output_tokens,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}
