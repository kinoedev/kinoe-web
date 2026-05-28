// News blackout — fetches Forex Factory weekly calendar and checks if a high-impact
// event for any currency in the scanned pair is within `blackoutMinutes` of now.
// Uses the public XML feed (no API key required).

const FF_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml";

export type NewsEvent = {
  title: string;
  country: string;   // currency code, e.g. "USD"
  eventTime: Date;
  impact: "High" | "Medium" | "Low";
  minsUntil: number; // negative = past
};

// Map pair instrument to the two affected currencies
function pairCurrencies(pair: string): string[] {
  const map: Record<string, string[]> = {
    EUR_USD: ["EUR", "USD"], GBP_USD: ["GBP", "USD"],
    USD_JPY: ["USD", "JPY"], USD_CHF: ["USD", "CHF"],
    USD_CAD: ["USD", "CAD"], AUD_USD: ["AUD", "USD"],
    NZD_USD: ["NZD", "USD"], GBP_JPY: ["GBP", "JPY"],
    EUR_JPY: ["EUR", "JPY"], GBP_AUD: ["GBP", "AUD"],
    XAU_USD: ["USD"],        XAG_USD: ["USD"],
  };
  return map[pair] ?? [pair.split("_")[0], pair.split("_")[1]];
}

function parseFFDate(dateStr: string, timeStr: string): Date | null {
  try {
    // Formats: "May 30, 2025" + "8:30am" or "All Day"
    if (!timeStr || timeStr.toLowerCase().includes("all day") || timeStr.toLowerCase() === "tentative") {
      return new Date(`${dateStr} 00:00:00 UTC`);
    }
    // Convert 12-hour to 24-hour
    const match = timeStr.match(/^(\d+):(\d+)(am|pm)$/i);
    if (!match) return null;
    let hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const meridian = match[3].toLowerCase();
    if (meridian === "pm" && hours !== 12) hours += 12;
    if (meridian === "am" && hours === 12) hours = 0;
    const padded = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    return new Date(`${dateStr} ${padded}:00 UTC`);
  } catch {
    return null;
  }
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : "";
}

async function fetchFFEvents(): Promise<NewsEvent[]> {
  const res = await fetch(FF_CALENDAR_URL, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`FF calendar fetch failed: ${res.status}`);
  const xml = await res.text();

  const now = new Date();
  const events: NewsEvent[] = [];

  // Split by <event> blocks
  const blocks = xml.split("<event>").slice(1);
  for (const block of blocks) {
    const impact = extractTag(block, "impact");
    if (impact !== "High") continue;

    const title = extractTag(block, "title");
    const country = extractTag(block, "country").toUpperCase();
    const dateStr = extractTag(block, "date");
    const timeStr = extractTag(block, "time");

    const eventTime = parseFFDate(dateStr, timeStr);
    if (!eventTime) continue;

    const minsUntil = Math.round((eventTime.getTime() - now.getTime()) / 60000);
    events.push({ title, country, eventTime, impact: "High", minsUntil });
  }

  return events;
}

export type NewsBlackoutResult = {
  blocked: boolean;
  reason?: string;
  blockingEvent?: NewsEvent;
  events: NewsEvent[];
};

export async function checkNewsBlackout(
  pair: string,
  blackoutMinutes: number
): Promise<NewsBlackoutResult> {
  let events: NewsEvent[] = [];
  try {
    events = await fetchFFEvents();
  } catch {
    // If feed is unreachable, don't block trading — fail open
    return { blocked: false, events: [] };
  }

  const currencies = pairCurrencies(pair);

  // Block if any high-impact event for this pair's currencies is within the window
  // Window: from -5 minutes (just released) to +blackoutMinutes (upcoming)
  const blocking = events.find((e) => {
    if (!currencies.includes(e.country)) return false;
    return e.minsUntil >= -5 && e.minsUntil <= blackoutMinutes;
  });

  if (blocking) {
    const dir = blocking.minsUntil >= 0 ? `in ${blocking.minsUntil}m` : `${Math.abs(blocking.minsUntil)}m ago`;
    return {
      blocked: true,
      reason: `News blackout: ${blocking.title} (${blocking.country}) ${dir}`,
      blockingEvent: blocking,
      events,
    };
  }

  return { blocked: false, events };
}
