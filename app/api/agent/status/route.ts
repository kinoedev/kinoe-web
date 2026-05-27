import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.OANDA_API_KEY;
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const accountType = process.env.OANDA_ACCOUNT_TYPE || "practice";

  if (!apiKey || !accountId) {
    return NextResponse.json({ ok: false, agent: "offline", error: "OANDA not configured" });
  }

  const baseUrl =
    accountType === "live"
      ? "https://api-fxtrade.oanda.com"
      : "https://api-fxpractice.oanda.com";

  try {
    const res = await fetch(`${baseUrl}/v3/accounts/${accountId}/summary`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, agent: "offline", error: `OANDA ${res.status}` });
    }

    const data = await res.json();
    const acct = data?.account;

    return NextResponse.json({
      ok: true,
      agent: "online",
      balance: acct?.balance ?? null,
      currency: acct?.currency ?? null,
      nav: acct?.NAV ?? null,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      agent: "offline",
      error: err instanceof Error ? err.message : "OANDA unreachable",
    });
  }
}