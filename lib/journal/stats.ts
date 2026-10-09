/** Pure journal analytics — shared by the dashboard, reports and playbooks pages. */
import type { JournalTrade, TradingAccount } from "./store";
import { chicagoHour } from "./time";

export type Summary = {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  netPnl: number;
  grossPnl: number;
  fees: number;
  avgWin: number;
  avgLoss: number;
  /** avg win ÷ |avg loss| */
  payoff: number;
  profitFactor: number;
  expectancy: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  avgR: number | null;
  rTrades: number;
  dayWinRate: number;
  tradingDays: number;
  bestDay: number;
  worstDay: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  avgHoldWinSec: number;
  avgHoldLossSec: number;
};

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const net = (t: JournalTrade) => t.pnl ?? 0;

export function dailyPnl(trades: JournalTrade[]): Map<string, { pnl: number; trades: number; wins: number; losses: number }> {
  const m = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>();
  for (const t of trades) {
    const d = t.trading_day ?? (t.exited_at ?? "").slice(0, 10);
    const e = m.get(d) ?? { pnl: 0, trades: 0, wins: 0, losses: 0 };
    e.pnl += net(t);
    e.trades++;
    if (net(t) > 0) e.wins++;
    else if (net(t) < 0) e.losses++;
    m.set(d, e);
  }
  return m;
}

export function summarize(trades: JournalTrade[]): Summary {
  const ordered = [...trades].sort((a, b) => (a.exited_at ?? "").localeCompare(b.exited_at ?? ""));
  const wins = ordered.filter((t) => net(t) > 0);
  const losses = ordered.filter((t) => net(t) < 0);
  const grossWin = sum(wins.map(net));
  const grossLoss = -sum(losses.map(net));

  let eq = 0;
  let peak = 0;
  let dd = 0;
  let run = 0;
  let maxW = 0;
  let maxL = 0;
  for (const t of ordered) {
    eq += net(t);
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
    const s = Math.sign(net(t));
    if (s > 0) run = run > 0 ? run + 1 : 1;
    else if (s < 0) run = run < 0 ? run - 1 : -1;
    else run = 0;
    maxW = Math.max(maxW, run);
    maxL = Math.max(maxL, -run);
  }

  const days = [...dailyPnl(ordered).values()];
  const withR = ordered.filter((t) => t.r_multiple !== null);
  const avgWin = avg(wins.map(net));
  const avgLoss = avg(losses.map(net));

  return {
    trades: ordered.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: ordered.length - wins.length - losses.length,
    winRate: wins.length + losses.length ? wins.length / (wins.length + losses.length) : 0,
    netPnl: sum(ordered.map(net)),
    grossPnl: sum(ordered.map((t) => t.gross_pnl ?? net(t))),
    fees: sum(ordered.map((t) => t.fees ?? 0)),
    avgWin,
    avgLoss,
    payoff: avgLoss ? avgWin / Math.abs(avgLoss) : avgWin > 0 ? Infinity : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: avg(ordered.map(net)),
    largestWin: wins.length ? Math.max(...wins.map(net)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map(net)) : 0,
    maxDrawdown: dd,
    avgR: withR.length ? avg(withR.map((t) => t.r_multiple as number)) : null,
    rTrades: withR.length,
    dayWinRate: days.length ? days.filter((d) => d.pnl > 0).length / days.length : 0,
    tradingDays: days.length,
    bestDay: days.length ? Math.max(...days.map((d) => d.pnl)) : 0,
    worstDay: days.length ? Math.min(...days.map((d) => d.pnl)) : 0,
    maxConsecWins: maxW,
    maxConsecLosses: maxL,
    avgHoldWinSec: avg(wins.map((t) => t.duration_sec ?? 0)),
    avgHoldLossSec: avg(losses.map((t) => t.duration_sec ?? 0)),
  };
}

export function equityCurve(trades: JournalTrade[]): { t: JournalTrade; equity: number }[] {
  let eq = 0;
  return [...trades]
    .sort((a, b) => (a.exited_at ?? "").localeCompare(b.exited_at ?? ""))
    .map((t) => ({ t, equity: (eq += net(t)) }));
}

// ── Kinoe score ─────────────────────────────────────────────────────────────

export type ScorePart = { label: string; score: number; detail: string };

/**
 * A 0–100 composite in the spirit of the Zella score. Each part is scaled to its own
 * "good" benchmark; rule adherence only counts when trades have been reviewed against a playbook.
 */
export function kinoeScore(s: Summary, trades: JournalTrade[], playbookRuleCounts: Map<string, number>): { score: number; parts: ScorePart[] } {
  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  const pf = s.profitFactor === Infinity ? 3 : s.profitFactor;
  const payoff = s.payoff === Infinity ? 3 : s.payoff;
  const grossWin = s.avgWin * s.wins;
  const ddScore = grossWin > 0 ? clamp(100 - (s.maxDrawdown / grossWin) * 100) : 0;
  const totalPositiveDays = s.bestDay > 0 && s.netPnl > 0 ? clamp(100 - (s.bestDay / s.netPnl) * 100 + 30) : 0;

  const reviewed = trades.filter((t) => t.playbook_id && playbookRuleCounts.get(t.playbook_id));
  const adherence = reviewed.length
    ? avg(reviewed.map((t) => t.rules_followed.length / (playbookRuleCounts.get(t.playbook_id as string) || 1))) * 100
    : null;

  const parts: ScorePart[] = [
    { label: "Win rate", score: clamp((s.winRate / 0.6) * 100), detail: `${(s.winRate * 100).toFixed(0)}%` },
    { label: "Profit factor", score: clamp((pf / 2.5) * 100), detail: s.profitFactor === Infinity ? "∞" : pf.toFixed(2) },
    { label: "Win / loss size", score: clamp((payoff / 2.5) * 100), detail: s.payoff === Infinity ? "∞" : payoff.toFixed(2) },
    { label: "Drawdown control", score: ddScore, detail: `$${s.maxDrawdown.toFixed(0)} max DD` },
    { label: "Consistency", score: totalPositiveDays, detail: s.netPnl > 0 ? `best day ${((s.bestDay / s.netPnl) * 100).toFixed(0)}% of profit` : "not net positive" },
  ];
  if (adherence !== null) parts.push({ label: "Rules followed", score: clamp(adherence), detail: `${adherence.toFixed(0)}% of ${reviewed.length} reviewed` });
  return { score: Math.round(avg(parts.map((p) => p.score))), parts };
}

// ── Breakdowns ──────────────────────────────────────────────────────────────

export type Group = { key: string; trades: number; winRate: number; net: number; avg: number; pf: number };

function group(trades: JournalTrade[], keyOf: (t: JournalTrade) => string | string[] | null, order?: string[]): Group[] {
  const m = new Map<string, JournalTrade[]>();
  for (const t of trades) {
    const k = keyOf(t);
    const keys = k === null ? [] : Array.isArray(k) ? k : [k];
    for (const key of keys) {
      const list = m.get(key) ?? [];
      list.push(t);
      m.set(key, list);
    }
  }
  const out = [...m.entries()].map(([key, ts]) => {
    const s = summarize(ts);
    return { key, trades: ts.length, winRate: s.winRate, net: s.netPnl, avg: s.expectancy, pf: s.profitFactor };
  });
  if (order) return out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return out.sort((a, b) => b.trades - a.trades);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DURATIONS = ["< 1 min", "1–5 min", "5–15 min", "15–60 min", "1–4 h", "4 h +"];

function hourLabel(h: number) {
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${ampm}`;
}

export function breakdowns(trades: JournalTrade[], names: { playbooks: Map<string, string>; accounts: Map<string, string> }) {
  const hours = Array.from({ length: 24 }, (_, i) => hourLabel((i + 17) % 24));
  return {
    symbol: group(trades, (t) => t.pair),
    direction: group(trades, (t) => (t.direction === "LONG" ? "Long" : "Short"), ["Long", "Short"]),
    hour: group(trades, (t) => (t.entered_at ? hourLabel(chicagoHour(Date.parse(t.entered_at)).hour) : null), hours),
    weekday: group(trades, (t) => (t.trading_day ? WEEKDAYS[new Date(`${t.trading_day}T12:00:00Z`).getUTCDay()] : null), WEEKDAYS),
    duration: group(
      trades,
      (t) => {
        const d = t.duration_sec;
        if (d === null) return null;
        return d < 60 ? DURATIONS[0] : d < 300 ? DURATIONS[1] : d < 900 ? DURATIONS[2] : d < 3600 ? DURATIONS[3] : d < 14400 ? DURATIONS[4] : DURATIONS[5];
      },
      DURATIONS
    ),
    playbook: group(trades, (t) => (t.playbook_id ? names.playbooks.get(t.playbook_id) ?? "Unknown" : "No playbook")),
    mistakes: group(trades, (t) => (t.mistake_tags?.length ? t.mistake_tags : null)),
    account: group(trades, (t) => (t.account_id ? names.accounts.get(t.account_id) ?? "Unknown" : "Manual")),
  };
}

// ── Prop firm rules ─────────────────────────────────────────────────────────

export type PropStatus = {
  balance: number;
  startingBalance: number;
  profit: number;
  profitTarget: number | null;
  targetProgress: number | null;
  floor: number | null;
  roomToFloor: number | null;
  todayPnl: number;
  dailyLimit: number | null;
  dailyRoom: number | null;
  highWaterEod: number;
  today: string;
};

/**
 * Balance, drawdown floor and daily-loss room from closed trades.
 * EOD trailing: floor = highest end-of-day balance − max drawdown, never below the starting floor.
 * (Firms differ on when the trail locks — check yours.)
 */
export function propStatus(account: TradingAccount, trades: JournalTrade[], today: string): PropStatus | null {
  if (account.starting_balance === null) return null;
  const start = account.starting_balance;
  const days = [...dailyPnl(trades.filter((t) => t.account_id === account.id)).entries()].sort(([a], [b]) => a.localeCompare(b));
  let bal = start;
  let hwm = start;
  for (const [, d] of days) {
    bal += d.pnl;
    hwm = Math.max(hwm, bal);
  }
  const todayPnl = days.find(([k]) => k === today)?.[1].pnl ?? 0;
  const dd = account.max_drawdown;
  let floor: number | null = null;
  if (dd !== null && account.drawdown_type === "STATIC") floor = start - dd;
  if (dd !== null && account.drawdown_type === "EOD_TRAILING") floor = Math.max(start - dd, hwm - dd);
  const profit = bal - start;
  return {
    balance: bal,
    startingBalance: start,
    profit,
    profitTarget: account.profit_target,
    targetProgress: account.profit_target ? Math.max(0, profit / account.profit_target) : null,
    floor,
    roomToFloor: floor !== null ? bal - floor : null,
    todayPnl,
    dailyLimit: account.daily_loss_limit,
    dailyRoom: account.daily_loss_limit !== null ? account.daily_loss_limit + Math.min(0, todayPnl) : null,
    highWaterEod: hwm,
    today,
  };
}
