import { NextRequest, NextResponse } from "next/server";

export type PriceData = {
  instrument: string;
  bid: number;
  ask: number;
  spread: number;
  spreadPips: number;
  tradeable: boolean;
};

export async function GET(req: NextRequest) {
  const instruments = req.nextUrl.searchParams.get("instruments") ?? "EUR_USD,GBP_USD,XAU_USD";
  const apiKey = process.env.OANDA_API_KEY;
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const accountType = process.env.OANDA_ACCOUNT_TYPE ?? "practice";

  if (!apiKey || !accountId) {
    return NextResponse.json({ ok: false, error: "OANDA not configured" }, { status: 500 });
  }

  const baseUrl = accountType === "live"
    ? "https://api-fxtrade.oanda.com"
    : "https://api-fxpractice.oanda.com";

  try {
    const res = await fetch(
      `${baseUrl}/v3/accounts/${accountId}/pricing?instruments=${instruments}`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `OANDA ${res.status}` }, { status: res.status });
    }

    const data = await res.json() as {
      prices: {
        instrument: string;
        bids: { price: string }[];
        asks: { price: string }[];
        tradeable: boolean;
      }[];
    };

    const prices: PriceData[] = (data.prices ?? []).map((p) => {
      const bid = Number(p.bids?.[0]?.price ?? 0);
      const ask = Number(p.asks?.[0]?.price ?? 0);
      const spread = ask - bid;
      // Pip value: JPY pairs = 2dp, XAU = 2dp, everything else = 4dp
      const pipMultiplier = p.instrument.includes("JPY") || p.instrument.includes("XAU") || p.instrument.includes("XAG") ? 100 : 10000;
      return {
        instrument: p.instrument,
        bid,
        ask,
        spread,
        spreadPips: Math.round(spread * pipMultiplier * 10) / 10,
        tradeable: p.tradeable,
      };
    });

    return NextResponse.json({ ok: true, prices, fetched_at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Prices fetch failed" },
      { status: 500 }
    );
  }
}
