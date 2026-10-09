/**
 * Minimal Databento Historical API client (HTTP, no SDK).
 * Docs: https://databento.com/docs/api-reference-historical
 *
 * Auth is HTTP basic with the API key as the username and a blank password.
 * Every byte pulled from timeseries.get_range is billed against the account's
 * credit, so callers should price requests with getCost() first and cache bars.
 */
import { DATABENTO_DATASET } from "./symbols";
import type { Bar, BarSchema } from "./types";

const BASE = "https://hist.databento.com/v0";

function apiKey(): string {
  const key = process.env.DATABENTO_API_KEY;
  if (!key) throw new Error("DATABENTO_API_KEY is not set");
  return key;
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${apiKey()}:`).toString("base64");
}

async function call(method: string, params: Record<string, string>): Promise<Response> {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.detail ?? body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`Databento ${method} ${res.status}: ${detail || res.statusText}`);
  }
  return res;
}

export type RangeRequest = {
  symbol: string;
  schema: BarSchema;
  start: Date;
  end: Date;
};

function rangeParams(r: RangeRequest): Record<string, string> {
  return {
    dataset: DATABENTO_DATASET,
    symbols: r.symbol,
    stype_in: "continuous",
    schema: r.schema,
    start: r.start.toISOString(),
    end: r.end.toISOString(),
  };
}

/** The latest time each schema has data for. Requests past this fail, so clamp to it. */
export async function getAvailableEnd(schema: BarSchema): Promise<Date> {
  const res = await fetch(`${BASE}/metadata.get_dataset_range?dataset=${DATABENTO_DATASET}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Databento metadata.get_dataset_range ${res.status}`);
  const body = (await res.json()) as { end?: string; schema?: Record<string, { end?: string }> };
  const end = body.schema?.[schema]?.end ?? body.end;
  if (!end) throw new Error("Databento did not return an available end time");
  return new Date(end);
}

/** Estimated USD cost of a request, charged against credit if it is run. */
export async function getCost(r: RangeRequest): Promise<number> {
  const res = await call("metadata.get_cost", { ...rangeParams(r), mode: "historical-streaming" });
  const text = (await res.text()).trim();
  const n = Number(text);
  if (!Number.isFinite(n)) throw new Error(`Unexpected cost response: ${text.slice(0, 80)}`);
  return n;
}

const PRICE_SCALE = 1e9;

function toPrice(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  // With pretty_px prices arrive as decimals; raw prices are fixed-point 1e-9 integers.
  return Math.abs(n) > 1e7 ? n / PRICE_SCALE : n;
}

function toMs(v: unknown): number {
  if (typeof v === "number") return v > 1e15 ? Math.floor(v / 1e6) : v;
  const s = String(v);
  if (/^\d+$/.test(s)) return Math.floor(Number(BigInt(s) / BigInt(1_000_000)));
  return Date.parse(s);
}

type RawRecord = {
  hd?: { ts_event?: string | number };
  ts_event?: string | number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
};

export function parseOhlcvJsonLines(text: string): Bar[] {
  const bars: Bar[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const r = JSON.parse(trimmed) as RawRecord;
    const ts = toMs(r.hd?.ts_event ?? r.ts_event);
    if (!Number.isFinite(ts)) continue;
    bars.push({
      ts,
      open: toPrice(r.open),
      high: toPrice(r.high),
      low: toPrice(r.low),
      close: toPrice(r.close),
      volume: Number(r.volume) || 0,
    });
  }
  return bars.sort((a, b) => a.ts - b.ts);
}

/** Download OHLCV bars. Billed against Databento credit. */
export async function fetchBars(r: RangeRequest): Promise<Bar[]> {
  const res = await call("timeseries.get_range", {
    ...rangeParams(r),
    encoding: "json",
    compression: "none",
    pretty_px: "true",
    pretty_ts: "true",
    map_symbols: "false",
  });
  return parseOhlcvJsonLines(await res.text());
}
