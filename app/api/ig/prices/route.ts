import { NextRequest, NextResponse } from "next/server";

const IG_BASE_URL = process.env.IG_DEMO === "true"
  ? "https://demo-api.ig.com/gateway/deal"
  : "https://api.ig.com/gateway/deal";

type IgSession = { cst: string; token: string };

// Module-level session cache (survives across requests in the same process).
// `sessionPromise` deduplicates concurrent logins so we don't hammer IG's
// /session endpoint and get rate-limited.
let igSession: (IgSession & { expiresAt: number }) | null = null;
let sessionPromise: Promise<IgSession> | null = null;

async function doLogin(): Promise<IgSession> {
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

  igSession = { cst, token, expiresAt: Date.now() + 5.5 * 60 * 60 * 1000 };
  return { cst, token };
}

async function getSession(): Promise<IgSession> {
  if (igSession && Date.now() < igSession.expiresAt) {
    return { cst: igSession.cst, token: igSession.token };
  }
  if (sessionPromise) return sessionPromise;
  sessionPromise = doLogin().finally(() => {
    sessionPromise = null;
  });
  return sessionPromise;
}

async function fetchMarkets(epics: string[], session: IgSession, apiKey: string) {
  const url = `${IG_BASE_URL}/markets?epics=${epics.map(encodeURIComponent).join(",")}`;
  return fetch(url, {
    method: "GET",
    headers: {
      "X-IG-API-KEY": apiKey,
      CST: session.cst,
      "X-SECURITY-TOKEN": session.token,
      "Content-Type": "application/json",
      Version: "1",
    },
    cache: "no-store",
  });
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
  const epics = epicsParam ? epicsParam.split(",").slice(0, 50) : DEFAULT_EPICS;

  try {
    let res = await fetchMarkets(epics, await getSession(), apiKey);

    if (res.status === 401) {
      igSession = null;
      res = await fetchMarkets(epics, await getSession(), apiKey);
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
