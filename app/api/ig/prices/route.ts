import { NextRequest, NextResponse } from "next/server";

const IG_BASE_URL = process.env.IG_DEMO === "true"
  ? "https://demo-api.ig.com/gateway/deal"
  : "https://api.ig.com/gateway/deal";

// Module-level session cache (survives across requests in the same process)
let igSession: { cst: string; token: string; expiresAt: number } | null = null;

async function getSession(): Promise<{ cst: string; token: string }> {
  if (igSession && Date.now() < igSession.expiresAt) {
    return { cst: igSession.cst, token: igSession.token };
  }

  const apiKey = process.env.IG_API_KEY;
  const identifier = process.env.IG_IDENTIFIER;
  const password = process.env.IG_PASSWORD;

  if (!apiKey || !identifier || !password) {
    throw new Error("Missing IG_API_KEY, IG_IDENTIFIER, or IG_PASSWORD in .env.local");
  }

  const res = await fetch(`${IG_BASE_URL}/session`, {
    method: "POST",
    headers: {
      "X-IG-API-KEY": apiKey,
      "Content-Type": "application/json",
      Version: "2",
    },
    body: JSON.stringify({ identifier, password, encryptedPassword: false }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`IG login failed (${res.status}): ${body}`);
  }

  const cst = res.headers.get("CST");
  const token = res.headers.get("X-SECURITY-TOKEN");

  if (!cst || !token) {
    throw new Error("IG login succeeded but missing CST or X-SECURITY-TOKEN headers");
  }

  // Cache for 5.5 hours (IG sessions expire after 6 hours of inactivity)
  igSession = { cst, token, expiresAt: Date.now() + 5.5 * 60 * 60 * 1000 };
  return { cst, token };
}

const DEFAULT_EPICS = [
  "CS.D.EURUSD.MINI.IP",
  "CS.D.GBPUSD.MINI.IP",
  "CS.D.USDJPY.MINI.IP",
  "CS.D.AUDUSD.MINI.IP",
  "CS.D.USDCAD.MINI.IP",
  "CS.D.EURGBP.MINI.IP",
];

export async function GET(req: NextRequest) {
  const apiKey = process.env.IG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing IG_API_KEY in .env.local" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const epicsParam = searchParams.get("epics");
  const epics = epicsParam ? epicsParam.split(",") : DEFAULT_EPICS;

  try {
    const { cst, token } = await getSession();

    const url = `${IG_BASE_URL}/markets?epics=${epics.join(",")}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-IG-API-KEY": apiKey,
        CST: cst,
        "X-SECURITY-TOKEN": token,
        "Content-Type": "application/json",
        Version: "1",
      },
      cache: "no-store",
    });

    if (res.status === 401) {
      // Session expired — invalidate cache and retry once
      igSession = null;
      const { cst: cst2, token: token2 } = await getSession();
      const retry = await fetch(url, {
        method: "GET",
        headers: {
          "X-IG-API-KEY": apiKey,
          CST: cst2,
          "X-SECURITY-TOKEN": token2,
          "Content-Type": "application/json",
          Version: "1",
        },
        cache: "no-store",
      });

      if (!retry.ok) {
        const body = await retry.text();
        return NextResponse.json(
          { ok: false, error: `IG markets fetch failed (${retry.status})`, body },
          { status: retry.status }
        );
      }

      const data = await retry.json();
      return NextResponse.json({ ok: true, markets: data.marketDetails ?? [] });
    }

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { ok: false, error: `IG markets fetch failed (${res.status})`, body },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, markets: data.marketDetails ?? [] });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
