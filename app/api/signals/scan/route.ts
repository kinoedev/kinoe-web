import { NextResponse } from "next/server";
import {
  parseCandles,
  getTrendBias,
  detectKangarooTail,
  detectBigShadow,
  detectInsideBar,
  extractKeyLevels,
} from "@/lib/signals/detection";
import { scanMarketsWithAI } from "@/lib/ai/scanner";

const PAIRS = ["EUR_USD", "GBP_USD", "XAU_USD"];

function getD1Bias(candles: ReturnType<typeof parseCandles>): string {
  const recent = candles.slice(-10);
  if (recent.length < 10) return "NEUTRAL";
  const change = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;
  if (change > 0.005) return "BULL";
  if (change < -0.005) return "BEAR";
  return "NEUTRAL";
}

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

    const pairData = await Promise.all(
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

        const h4Bias = getTrendBias(h4Candles);
        const d1Bias = getD1Bias(d1Candles);
        const ktResult = detectKangarooTail(h4Candles, h4Bias);
        const bigShadow = detectBigShadow(h4Candles);
        const insideBar = detectInsideBar(h4Candles);
        const keyLevels = extractKeyLevels(h4Candles);

        return {
          pair,
          d1_bias: d1Bias,
          h4_candles: h4Candles.slice(-20),
          patterns: { kt: ktResult.isValidSetup, big_shadow: bigShadow, inside_bar: insideBar, bias: h4Bias },
          key_levels_raw: keyLevels,
        };
      })
    );

    const aiResult = await scanMarketsWithAI(pairData);

    return NextResponse.json({
      ok: true,
      scanned_at: new Date().toISOString(),
      summary: aiResult.output.summary,
      pairs: aiResult.output.pairs,
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
