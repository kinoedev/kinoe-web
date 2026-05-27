import { NextResponse } from "next/server";
import { createJournalEntry, findRecentAgentSignal } from "@/lib/db/queries";
import type { Direction } from "@/lib/db/types";

type OandaCandle = {
  complete: boolean;
  time: string;
  mid: { o: string; h: string; l: string; c: string };
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
    .filter((c) => c.complete)
    .map((c) => ({
      time: c.time,
      open: Number(c.mid.o),
      high: Number(c.mid.h),
      low: Number(c.mid.l),
      close: Number(c.mid.c),
    }));
}

function getTrendBias(candles: ParsedCandle[]): string {
  const recent = candles.slice(-20);
  if (recent.length < 20) return "NEUTRAL";
  const change = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;
  if (change > 0.003) return "BULL";
  if (change < -0.003) return "BEAR";
  return "NEUTRAL";
}

type KTResult = {
  isValidSetup: boolean;
  score: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  reason: string;
};

function detectKangarooTail(candles: ParsedCandle[], bias: string): KTResult {
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

  const riskReward = 3;

  if (isBearish) {
    const entry = last.close;
    const stopLoss = last.high;
    const risk = stopLoss - entry;
    return {
      isValidSetup: true, score: 80, entry, stopLoss,
      takeProfit: entry - risk * riskReward, riskReward,
      reason: "Bearish Kangaroo Tail: long upper wick with bearish trend bias.",
    };
  }

  const entry = last.close;
  const stopLoss = last.low;
  const risk = entry - stopLoss;
  return {
    isValidSetup: true, score: 80, entry, stopLoss,
    takeProfit: entry + risk * riskReward, riskReward,
    reason: "Bullish Kangaroo Tail: long lower wick with bullish trend bias.",
  };
}

export async function POST() {
  try {
    const apiKey = process.env.OANDA_API_KEY;
    const accountType = process.env.OANDA_ACCOUNT_TYPE || "practice";
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing OANDA_API_KEY" }, { status: 500 });
    }

    const baseUrl = accountType === "live"
      ? "https://api-fxtrade.oanda.com"
      : "https://api-fxpractice.oanda.com";

    const pair = "EUR_USD";
    const timeframe = "H4";

    const res = await fetch(`${baseUrl}/v3/instruments/${pair}/candles?granularity=${timeframe}&count=100&price=M`, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: data?.errorMessage || "OANDA request failed" }, { status: res.status });
    }

    const candles = parseCandles(data.candles || []);
    const bias = getTrendBias(candles);
    const signal = detectKangarooTail(candles, bias);

    if (!signal.isValidSetup || signal.entry === null) {
      return NextResponse.json({ ok: true, logged: false, reason: signal.reason });
    }

    const existing = await findRecentAgentSignal(pair, timeframe, signal.entry);
    if (existing) {
      return NextResponse.json({ ok: true, logged: false, reason: "Duplicate: same signal already logged this H4 window.", existing_id: existing.id });
    }

    const direction: Direction = bias === "BULL" ? "LONG" : "SHORT";

    const entry = await createJournalEntry({
      pair,
      timeframe,
      direction,
      setup_type: "Kangaroo Tail",
      bias,
      entry_price: signal.entry,
      stop_loss: signal.stopLoss,
      take_profit: signal.takeProfit,
      risk_reward: signal.riskReward,
      entered_at: new Date().toISOString(),
      thesis_md: signal.reason,
      source: "agent_signal",
    });

    return NextResponse.json({ ok: true, logged: true, entry });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Log failed" },
      { status: 500 }
    );
  }
}
