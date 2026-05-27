import { NextResponse } from "next/server";
import {
  parseCandles,
  getTrendBias,
  detectKangarooTail,
} from "@/lib/signals/detection";

export async function GET() {
  try {
    const apiKey = process.env.OANDA_API_KEY;
    const accountType = process.env.OANDA_ACCOUNT_TYPE || "practice";

    if (!apiKey) {
      return NextResponse.json({ ok: false, reason: "Missing OANDA_API_KEY in .env.local." }, { status: 500 });
    }

    const baseUrl =
      accountType === "live"
        ? "https://api-fxtrade.oanda.com"
        : "https://api-fxpractice.oanda.com";

    const pair = "EUR_USD";
    const timeframe = "H4";

    const response = await fetch(
      `${baseUrl}/v3/instruments/${pair}/candles?granularity=${timeframe}&count=100&price=M`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, reason: data?.errorMessage || "OANDA candle request failed." },
        { status: response.status }
      );
    }

    const candles = parseCandles(data.candles || []);
    const bias = getTrendBias(candles);
    const setup = detectKangarooTail(candles, bias);

    return NextResponse.json({ ok: true, pair, timeframe, bias, setup: "Kangaroo Tail", ...setup });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Signal scan failed." },
      { status: 500 }
    );
  }
}
