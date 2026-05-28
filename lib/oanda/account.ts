// OANDA account queries — trade state and closure detection.
// Uses practice or live base URL from env; never logs tokens.

export type OandaTradeState = "OPEN" | "CLOSED" | "CLOSE_WHEN_TRADEABLE";

export type OandaClosedTrade = {
  id: string;
  instrument: string;            // e.g. "EUR_USD"
  openTime: string;              // ISO timestamp
  closeTime: string;             // ISO timestamp
  direction: "LONG" | "SHORT";  // derived from initialUnits sign
  openPrice: number;
  closePrice: number;
  realizedPL: number;            // in account currency (USD)
  units: number;                 // absolute
};

type RawOandaTrade = {
  id: string;
  instrument: string;
  openTime: string;
  closeTime?: string;
  price: string;
  averageClosePrice?: string;
  realizedPL?: string;
  initialUnits: string;
  currentUnits?: string;
  state: OandaTradeState;
};

function mapTrade(raw: RawOandaTrade): OandaClosedTrade | null {
  if (!raw.closeTime || !raw.averageClosePrice) return null;
  const units = Number(raw.initialUnits);
  return {
    id: raw.id,
    instrument: raw.instrument,
    openTime: raw.openTime,
    closeTime: raw.closeTime,
    direction: units > 0 ? "LONG" : "SHORT",
    openPrice: Number(raw.price),
    closePrice: Number(raw.averageClosePrice),
    realizedPL: Number(raw.realizedPL ?? 0),
    units: Math.abs(units),
  };
}

export async function getRecentClosedTrades(
  accountId: string,
  apiKey: string,
  baseUrl: string,
  instrument?: string,
  count = 50
): Promise<OandaClosedTrade[]> {
  const params = new URLSearchParams({
    state: "CLOSED",
    count: String(count),
  });
  if (instrument) params.set("instrument", instrument);

  const res = await fetch(
    `${baseUrl}/v3/accounts/${accountId}/trades?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`OANDA trades fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { trades?: RawOandaTrade[] };
  return (data.trades ?? []).flatMap((t) => {
    const mapped = mapTrade(t);
    return mapped ? [mapped] : [];
  });
}

export async function getAccountBalance(
  accountId: string,
  apiKey: string,
  baseUrl: string
): Promise<number | null> {
  try {
    const res = await fetch(`${baseUrl}/v3/accounts/${accountId}/summary`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { account?: { balance?: string; NAV?: string } };
    const raw = data.account?.NAV ?? data.account?.balance;
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export async function getOpenTrades(
  accountId: string,
  apiKey: string,
  baseUrl: string
): Promise<Array<{ id: string; instrument: string; direction: "LONG" | "SHORT"; openTime: string; openPrice: number; units: number }>> {
  const res = await fetch(
    `${baseUrl}/v3/accounts/${accountId}/openTrades`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`OANDA open trades fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { trades?: RawOandaTrade[] };
  return (data.trades ?? []).map((t) => ({
    id: t.id,
    instrument: t.instrument,
    direction: Number(t.initialUnits) > 0 ? "LONG" : "SHORT",
    openTime: t.openTime,
    openPrice: Number(t.price),
    units: Math.abs(Number(t.initialUnits)),
  }));
}
