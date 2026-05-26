import { NextResponse } from "next/server";

type OandaCandle = {
  complete: boolean;
  time: string;
  mid: {
    o: string;
    h: string;
    l: string;
    c: string;
  };
};

type ParsedCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

function parseCandles(candles: OandaCandle[]): ParsedCandle[] {
  return candles
    .filter((candle) => candle.complete)
    .map((candle) => ({
      time: candle.time,
      open: Number(candle.mid.o),
      high: Number(candle.mid.h),
      low: Number(candle.mid.l),
      close: Number(candle.mid.c),
    }));
}

function getTrendBias(candles: ParsedCandle[]) {
  const recentCandles = candles.slice(-20);

  if (recentCandles.length < 20) {
    return "NEUTRAL";
  }

  const firstClose = recentCandles[0].close;
  const lastClose = recentCandles[recentCandles.length - 1].close;

  const changePercent = (lastClose - firstClose) / firstClose;

  if (changePercent > 0.003) return "BULL";
  if (changePercent < -0.003) return "BEAR";

  return "NEUTRAL";
}

function detectKangarooTail(candles: ParsedCandle[], bias: string) {
  const lastCandle = candles[candles.length - 1];

  if (!lastCandle) {
    return {
      isValidSetup: false,
      score: 0,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      reason: "No completed candle was available for analysis.",
    };
  }

  const range = lastCandle.high - lastCandle.low;
  const body = Math.abs(lastCandle.close - lastCandle.open);
  const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;

  if (range <= 0) {
    return {
      isValidSetup: false,
      score: 0,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      reason: "The latest candle range was invalid.",
    };
  }

  const bodyRatio = body / range;
  const upperWickRatio = upperWick / range;
  const lowerWickRatio = lowerWick / range;

  const isBearishTail =
    bias === "BEAR" && upperWickRatio >= 0.6 && bodyRatio <= 0.3;

  const isBullishTail =
    bias === "BULL" && lowerWickRatio >= 0.6 && bodyRatio <= 0.3;

  const isValidSetup = isBearishTail || isBullishTail;

  if (!isValidSetup) {
    return {
      isValidSetup: false,
      score: Math.round(Math.max(upperWickRatio, lowerWickRatio) * 50),
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskReward: null,
      reason: "No valid Kangaroo Tail setup found on the latest completed candle.",
    };
  }

  const riskReward = 3;

  if (isBearishTail) {
    const entry = lastCandle.close;
    const stopLoss = lastCandle.high;
    const risk = stopLoss - entry;
    const takeProfit = entry - risk * riskReward;

    return {
      isValidSetup: true,
      score: 80,
      entry,
      stopLoss,
      takeProfit,
      riskReward,
      reason:
        "Bearish Kangaroo Tail found. The candle has a long upper wick aligned with bearish trend bias.",
    };
  }

  const entry = lastCandle.close;
  const stopLoss = lastCandle.low;
  const risk = entry - stopLoss;
  const takeProfit = entry + risk * riskReward;

  return {
    isValidSetup: true,
    score: 80,
    entry,
    stopLoss,
    takeProfit,
    riskReward,
    reason:
      "Bullish Kangaroo Tail found. The candle has a long lower wick aligned with bullish trend bias.",
  };
}

export async function GET() {
  try {
    const apiKey = process.env.OANDA_API_KEY;
    const accountType = process.env.OANDA_ACCOUNT_TYPE || "practice";

    const baseUrl =
      accountType === "live"
        ? "https://api-fxtrade.oanda.com"
        : "https://api-fxpractice.oanda.com";

    const pair = "EUR_USD";
    const timeframe = "H4";

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          reason: "Missing OANDA_API_KEY in .env.local.",
        },
        { status: 500 }
      );
    }

    const url = `${baseUrl}/v3/instruments/${pair}/candles?granularity=${timeframe}&count=100&price=M`;

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: data?.errorMessage || "OANDA candle request failed.",
        },
        { status: response.status }
      );
    }

    const candles = parseCandles(data.candles || []);
    const bias = getTrendBias(candles);
    const setup = detectKangarooTail(candles, bias);

    return NextResponse.json({
      ok: true,
      pair,
      timeframe,
      bias,
      setup: "Kangaroo Tail",
      ...setup,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : "Signal scan failed.",
      },
      { status: 500 }
    );
  }
}