/**
 * Ki's written trading plan. Sources: her Tradovate history (Sep–Oct 2026, 204 trades), the Breakout Lab
 * run on MNQ/MES/MGC/MCL (1,019 breaks, 60 days), and her VWAP, Volume Profile and Futures courses.
 * Edit here; the Strategy page renders it.
 */

export const PLAN_VERSION = "v1 · October 2026";

export const ONE_LINER =
  "Trade 15m displacement breaks of marked levels in the direction of the 1H trend and VWAP, or fade failed breaks back to value. Max 3 trades. Two losses and done.";

export type Evidence = { label: string; value: string; tone: "good" | "bad" | "neutral" };

/** What the data said — the reasons behind the rules. */
export const EVIDENCE: Evidence[] = [
  { label: "Breaks with a displacement candle kept going", value: "63% vs 48%", tone: "good" },
  { label: "Your trades held 15 min or longer", value: "+$2,577 on 95 trades", tone: "good" },
  { label: "Your trades closed inside 5 min", value: "−$1,654 on 54 trades", tone: "bad" },
  { label: "Your trades opened 9–11 AM CT", value: "−$1,138 on 39 trades", tone: "bad" },
  { label: "Your evening session (5 PM–2 AM CT)", value: "+$1,292 on 79 trades", tone: "good" },
  { label: "Fees as a share of your gross profit", value: "24% ($419 of $1,752)", tone: "bad" },
];

export type Step = { when: string; title: string; detail: string };

export const PREP: Step[] = [
  {
    when: "Sunday",
    title: "Weekly zones",
    detail:
      "Run the Scanner. Draw its 3–5 zones as rectangles: week high/low, outer swings, VAH / POC / VAL, low-volume nodes. Note any naked POCs above and below — they're targets.",
  },
  {
    when: "Before each session",
    title: "Session levels",
    detail:
      "Mark the previous day's high/low, the overnight (Asia/London) high/low and the session open. These are the most-watched levels in futures and where liquidity sits.",
  },
  {
    when: "Before each session",
    title: "Context",
    detail:
      "Which side of session VWAP is price on, and is VWAP sloping or flat? Is price inside or outside yesterday's value area? Any CPI / NFP / FOMC / EIA today?",
  },
  {
    when: "Before each session",
    title: "Write the plan",
    detail: "Notebook → pre-market: bias, the 2–3 levels you'll trade, and what would make you stand aside.",
  },
];

export const BIAS: { state: string; rule: string }[] = [
  {
    state: "Trend up",
    rule: "1H higher highs + higher lows, price above a rising VWAP. Longs only — breakouts up and pullbacks to VWAP. No shorts.",
  },
  {
    state: "Trend down",
    rule: "1H lower highs + lower lows, price below a falling VWAP. Shorts only. No longs.",
  },
  {
    state: "Range",
    rule: "VWAP flat and price inside value. No breakout trades. Only fades at VAH / VAL (setup C) back toward POC.",
  },
  {
    state: "Change of character",
    rule: "The 1H breaks its pattern (first lower low in an uptrend, or the reverse). Stand aside until a new structure forms.",
  },
];

export type Setup = {
  key: "A" | "B" | "C";
  name: string;
  tagline: string;
  when: string;
  trigger: string[];
  entry: string;
  stop: string;
  targets: string;
  skip: string[];
};

export const SETUPS: Setup[] = [
  {
    key: "A",
    name: "Displacement breakout",
    tagline: "Your main setup — the one the data backs.",
    when: "Trend up or trend down, at a marked zone.",
    trigger: [
      "A 15m candle CLOSES through the zone in your bias direction.",
      "It's a displacement candle: body at least as big as a normal 15m candle's range, closing in the top 30% (bottom 30% for shorts).",
      "The Scanner tags it Strong.",
    ],
    entry: "Wait for price to come back to the zone (or the fair value gap the candle left) within the next 4 candles. Enter on a 5m rejection candle there. No retest = no trade.",
    stop: "Beyond the zone — the other side of the level you broke.",
    targets: "T1: the next zone or naked POC. T2: the level after. Only take it if T1 is at least 2R away.",
    skip: ["Small or wicky break candle (Weak / Likely trap)", "VWAP flat or on the wrong side", "Next zone closer than 2R"],
  },
  {
    key: "B",
    name: "Trend pullback to VWAP",
    tagline: "For trend days when you missed the break.",
    when: "Trend up or trend down, VWAP clearly sloping.",
    trigger: [
      "Price pulls back into VWAP or the first band, ideally where it lines up with a zone.",
      "A 5m confirmation candle (engulfing or hammer) in the trend direction.",
    ],
    entry: "On the break of the confirmation candle's high (low for shorts).",
    stop: "Below the pullback swing (above it for shorts).",
    targets: "2R, or the day's high/low if it's closer than 3R.",
    skip: ["VWAP flat", "Price already at the outer band — overextended", "The pullback closes through VWAP on the 15m"],
  },
  {
    key: "C",
    name: "Failed break / value-edge fade",
    tagline: "Fade traps back to value.",
    when: "Range days, or any time a break fails at an obvious level.",
    trigger: [
      "A 15m candle wicks through PDH/PDL, equal highs/lows, VAH or VAL — and closes back inside.",
      "Or price returns to VAH/VAL inside a range and prints a rejection candle.",
    ],
    entry: "On the 5m candle that confirms the turn back inside.",
    stop: "Past the wick.",
    targets: "T1: POC. T2: the opposite edge of value (or a naked POC).",
    skip: ["The 15m closes outside and holds (that's acceptance — it's a breakout now)", "Against a strong 1H trend"],
  },
];

export const NO_TRADE: { rule: string; why: string }[] = [
  { rule: "No entry before the 15m candle closes.", why: "Your trades closed inside 5 minutes lost $1,654 — the usual sign of entering before confirmation." },
  { rule: "No new trades 9:00–11:00 AM CT.", why: "That window lost $1,138. Re-test it in the journal after 30 trades." },
  { rule: "Max 3 trades a day.", why: "Fees took 24% of your gross. Oct 9 had 36 trades." },
  { rule: "Two losses or −$300 and you're done for the day.", why: "Half of LucidFlex's $600 daily limit — you keep the account alive." },
  { rule: "No trades 5 min either side of CPI, NFP, FOMC, or the Wednesday EIA report (crude).", why: "Spreads blow out and stops slip." },
  { rule: "No breakouts when VWAP is flat and price is inside value.", why: "That's chop — the VWAP and volume profile courses both say fade the edges instead." },
];

export const MANAGEMENT: string[] = [
  "Don't touch the trade for the first 15 minutes unless the stop is hit or a 15m candle closes back through the level. Your winners needed time.",
  "At T1: take half off and move the stop to breakeven.",
  "Trail the rest behind each 15m swing low (swing high for shorts), or close it at T2.",
  "Flat by 3:55 PM CT. No holding into the daily close on an evaluation.",
];

export const RISK = {
  account: "LucidFlex 25K",
  riskPerTrade: 100,
  dailyStop: 300,
  firmDailyLimit: 600,
  maxDrawdown: 1000,
  why: "Risk $100 per trade — a tenth of the $1,000 drawdown. The course's 1% ($250) would let 4 losses end the account; $100 gives you 10.",
};

/** Dollars per 1.0 point, one contract. */
export const POINT_VALUES: { root: string; pv: number }[] = [
  { root: "MNQ", pv: 2 },
  { root: "MES", pv: 5 },
  { root: "MGC", pv: 10 },
  { root: "MCL", pv: 100 },
  { root: "NQ", pv: 20 },
  { root: "ES", pv: 50 },
];

export const CHECKLIST: string[] = [
  "I know the bias: trend up, trend down, or range",
  "Price is at one of my marked levels",
  "The 15m candle has CLOSED (no entering on the push)",
  "It's a displacement candle — or this is a setup B / C trade",
  "VWAP is on my side (or it's a range fade at VAH / VAL)",
  "T1 is at least 2R away",
  "Size = $100 ÷ (stop points × $ per point)",
  "It's not 9–11 AM CT and not within 5 min of news",
  "Under 3 trades and under 2 losses today",
];

export const REVIEW: string[] = [
  "Every trade: tag the playbook (A / B / C) and tick the rules you followed in the journal.",
  "Every evening: Notebook → what you did vs the plan.",
  "Every Sunday: Journal → Reports and the Breakout Lab. Change one rule at a time, only when 30+ trades say so.",
];
