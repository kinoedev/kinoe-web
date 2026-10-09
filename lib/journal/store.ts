import { sql } from "@/lib/db/client";
import { specFor } from "./contracts";
import { feesFor, tradeHash, type ParseResult } from "./import";
import { cmeTradingDay } from "./time";

// ── Accounts ────────────────────────────────────────────────────────────────

export type TradingAccount = {
  id: string;
  created_at: string;
  name: string;
  firm: string | null;
  platform: string;
  account_number: string | null;
  starting_balance: number | null;
  profit_target: number | null;
  daily_loss_limit: number | null;
  max_drawdown: number | null;
  drawdown_type: "EOD_TRAILING" | "STATIC" | "NONE";
  fees_micro_rt: number;
  fees_mini_rt: number;
  timezone: string;
  status: "ACTIVE" | "PASSED" | "FUNDED" | "FAILED" | "CLOSED";
  notes: string | null;
};

const ACCOUNT_FIELDS = [
  "name",
  "firm",
  "platform",
  "account_number",
  "starting_balance",
  "profit_target",
  "daily_loss_limit",
  "max_drawdown",
  "drawdown_type",
  "fees_micro_rt",
  "fees_mini_rt",
  "timezone",
  "status",
  "notes",
] as const;

const NUMERIC = new Set(["starting_balance", "profit_target", "daily_loss_limit", "max_drawdown", "fees_micro_rt", "fees_mini_rt"]);

function toAccount(r: Record<string, unknown>): TradingAccount {
  const out = { ...r } as Record<string, unknown>;
  for (const k of NUMERIC) out[k] = r[k] === null || r[k] === undefined ? null : Number(r[k]);
  return out as TradingAccount;
}

export function cleanAccountInput(raw: Record<string, unknown>): Partial<TradingAccount> {
  const out: Record<string, unknown> = {};
  for (const k of ACCOUNT_FIELDS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (NUMERIC.has(k)) out[k] = v === "" || v === null ? null : Number(v);
    else out[k] = v === "" ? null : v;
  }
  return out as Partial<TradingAccount>;
}

export async function listAccounts(): Promise<TradingAccount[]> {
  const rows = (await sql`SELECT * FROM trading_accounts ORDER BY created_at`) as Record<string, unknown>[];
  return rows.map(toAccount);
}

export async function getAccount(id: string): Promise<TradingAccount | null> {
  const rows = (await sql`SELECT * FROM trading_accounts WHERE id = ${id}`) as Record<string, unknown>[];
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function createAccount(a: Partial<TradingAccount>): Promise<TradingAccount> {
  if (!a.name) throw new Error("Account name is required");
  const rows = (await sql`
    INSERT INTO trading_accounts (name, firm, platform, account_number, starting_balance, profit_target,
      daily_loss_limit, max_drawdown, drawdown_type, fees_micro_rt, fees_mini_rt, timezone, status, notes)
    VALUES (${a.name}, ${a.firm ?? null}, ${a.platform ?? "Tradovate"}, ${a.account_number ?? null},
      ${a.starting_balance ?? null}, ${a.profit_target ?? null}, ${a.daily_loss_limit ?? null}, ${a.max_drawdown ?? null},
      ${a.drawdown_type ?? "EOD_TRAILING"}, ${a.fees_micro_rt ?? 0}, ${a.fees_mini_rt ?? 0},
      ${a.timezone ?? "America/Chicago"}, ${a.status ?? "ACTIVE"}, ${a.notes ?? null})
    RETURNING *
  `) as Record<string, unknown>[];
  return toAccount(rows[0]);
}

export async function updateAccount(id: string, a: Partial<TradingAccount>): Promise<TradingAccount | null> {
  const cur = await getAccount(id);
  if (!cur) return null;
  const m = { ...cur, ...a };
  const rows = (await sql`
    UPDATE trading_accounts SET
      name = ${m.name}, firm = ${m.firm}, platform = ${m.platform}, account_number = ${m.account_number},
      starting_balance = ${m.starting_balance}, profit_target = ${m.profit_target},
      daily_loss_limit = ${m.daily_loss_limit}, max_drawdown = ${m.max_drawdown}, drawdown_type = ${m.drawdown_type},
      fees_micro_rt = ${m.fees_micro_rt}, fees_mini_rt = ${m.fees_mini_rt}, timezone = ${m.timezone},
      status = ${m.status}, notes = ${m.notes}
    WHERE id = ${id}
    RETURNING *
  `) as Record<string, unknown>[];
  return rows[0] ? toAccount(rows[0]) : null;
}

/** Re-apply the account's fee settings to its imported trades (after fees are edited). */
export async function refreshAccountFees(id: string) {
  const a = await getAccount(id);
  if (!a) return;
  const rows = (await sql`
    SELECT id, pair, quantity, gross_pnl FROM journal_entries
    WHERE account_id = ${id} AND import_hash IS NOT NULL
      -- trades whose fees came from the report itself keep them
      AND NOT COALESCE(executions_json->0 ? 'fee', false)
  `) as { id: string; pair: string; quantity: string; gross_pnl: string }[];
  const updates = rows.map((r) => {
    const micro = specFor(r.pair)?.micro ?? false;
    const fees = Math.round(Number(r.quantity) * (micro ? a.fees_micro_rt : a.fees_mini_rt) * 100) / 100;
    const net = Math.round((Number(r.gross_pnl) - fees) * 100) / 100;
    return { id: r.id, fees, pnl: net, outcome: net > 0 ? "WIN" : net < 0 ? "LOSS" : "BE" };
  });
  if (!updates.length) return;
  await sql.query(
    `UPDATE journal_entries j SET fees = u.fees, pnl = u.pnl, outcome = u.outcome, updated_at = now()
     FROM jsonb_to_recordset($1::jsonb) AS u(id uuid, fees numeric, pnl numeric, outcome text)
     WHERE j.id = u.id`,
    [JSON.stringify(updates)]
  );
}

// ── Import ──────────────────────────────────────────────────────────────────

export async function importTrades(accountId: string, filename: string, parsed: ParseResult) {
  const account = await getAccount(accountId);
  if (!account) throw new Error("Account not found");
  const trades = parsed.trades;
  const from = trades.length ? Math.min(...trades.map((t) => t.entryTs)) : null;
  const to = trades.length ? Math.max(...trades.map((t) => t.exitTs)) : null;

  const imp = (await sql`
    INSERT INTO trade_imports (account_id, filename, format, rows_read, date_from, date_to)
    VALUES (${accountId}, ${filename}, ${parsed.format}, ${parsed.rowsRead},
            ${from ? new Date(from).toISOString() : null}, ${to ? new Date(to).toISOString() : null})
    RETURNING id
  `) as { id: string }[];
  const importId = imp[0].id;

  // Report fees are spread per contract; round them cumulatively so the cents sum to the report total.
  const reportFees = new Map<(typeof trades)[number], number>();
  let cum = 0;
  let prevRounded = 0;
  for (const t of trades) {
    if (t.fees === null) continue;
    cum += t.fees;
    const r = Math.round(cum * 100) / 100;
    reportFees.set(t, Math.round((r - prevRounded) * 100) / 100);
    prevRounded = r;
  }

  const records = trades.map((t) => {
    const fees = reportFees.get(t) ?? feesFor(t, account.fees_micro_rt, account.fees_mini_rt);
    const net = Math.round((t.grossPnl - fees) * 100) / 100;
    const sign = t.direction === "LONG" ? 1 : -1;
    const risk = t.initialStop !== null ? Math.abs(t.entryPrice - t.initialStop) : 0;
    return {
      import_hash: tradeHash(accountId, t),
      pair: t.root,
      direction: t.direction,
      entry_price: t.entryPrice,
      exit_price: t.exitPrice,
      stop_loss: t.initialStop,
      quantity: t.qty,
      gross_pnl: t.grossPnl,
      fees,
      pnl: net,
      outcome: net > 0 ? "WIN" : net < 0 ? "LOSS" : "BE",
      r_multiple: risk > 0 ? Math.round(((sign * (t.exitPrice - t.entryPrice)) / risk) * 100) / 100 : null,
      entered_at: new Date(t.entryTs).toISOString(),
      exited_at: new Date(t.exitTs).toISOString(),
      trading_day: cmeTradingDay(t.exitTs),
      duration_sec: Math.round((t.exitTs - t.entryTs) / 1000),
      executions_json: t.executions,
    };
  });

  let created = 0;
  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const rows = (await sql.query(
      `INSERT INTO journal_entries (import_hash, pair, timeframe, direction, entry_price, exit_price, stop_loss,
         quantity, gross_pnl, fees, pnl, outcome, r_multiple, entered_at, exited_at, trading_day, duration_sec,
         executions_json, source, account_id, import_id)
       SELECT r.import_hash, r.pair, '—', r.direction, r.entry_price, r.exit_price, r.stop_loss,
         r.quantity, r.gross_pnl, r.fees, r.pnl, r.outcome, r.r_multiple, r.entered_at, r.exited_at, r.trading_day,
         r.duration_sec, r.executions_json, 'import', $2::uuid, $3::uuid
       FROM jsonb_to_recordset($1::jsonb) AS r(import_hash text, pair text, direction text, entry_price numeric,
         exit_price numeric, stop_loss numeric, quantity numeric, gross_pnl numeric, fees numeric, pnl numeric,
         outcome text, r_multiple numeric, entered_at timestamptz, exited_at timestamptz, trading_day date,
         duration_sec int, executions_json jsonb)
       ON CONFLICT (import_hash) DO NOTHING
       RETURNING id`,
      [JSON.stringify(records.slice(i, i + CHUNK)), accountId, importId]
    )) as { id: string }[];
    created += rows.length;
  }
  const duplicates = records.length - created;
  await sql`UPDATE trade_imports SET trades_created = ${created}, duplicates = ${duplicates} WHERE id = ${importId}`;
  return { importId, created, duplicates, total: records.length };
}

export async function listImports(): Promise<Record<string, unknown>[]> {
  return (await sql`
    SELECT i.*, a.name AS account_name FROM trade_imports i
    LEFT JOIN trading_accounts a ON a.id = i.account_id
    ORDER BY i.created_at DESC LIMIT 30
  `) as Record<string, unknown>[];
}

/** Delete an import and the trades it created. */
export async function deleteImport(id: string): Promise<number> {
  const rows = (await sql`DELETE FROM journal_entries WHERE import_id = ${id} RETURNING id`) as unknown[];
  await sql`DELETE FROM trade_imports WHERE id = ${id}`;
  return rows.length;
}

// ── Trades for the dashboard ────────────────────────────────────────────────

export type JournalTrade = {
  id: string;
  account_id: string | null;
  pair: string;
  direction: "LONG" | "SHORT";
  setup_type: string | null;
  playbook_id: string | null;
  outcome: string | null;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  quantity: number | null;
  gross_pnl: number | null;
  fees: number | null;
  pnl: number | null;
  r_multiple: number | null;
  entered_at: string | null;
  exited_at: string | null;
  trading_day: string | null;
  duration_sec: number | null;
  mistake_tags: string[];
  emotion_tags: string[];
  rules_followed: string[];
  rating: number | null;
  ai_grade: string | null;
  source: string;
};

const TRADE_NUMS = ["entry_price", "exit_price", "stop_loss", "quantity", "gross_pnl", "fees", "pnl", "r_multiple"] as const;

export async function listTrades(opts: { accountId?: string | null; from?: string | null; to?: string | null }): Promise<JournalTrade[]> {
  const rows = (await sql`
    SELECT id, account_id, pair, direction, setup_type, playbook_id, outcome, entry_price, exit_price, stop_loss,
           quantity, gross_pnl, fees, pnl, r_multiple, entered_at, exited_at,
           COALESCE(trading_day, (exited_at AT TIME ZONE 'America/Chicago')::date)::text AS trading_day,
           duration_sec, mistake_tags, emotion_tags, rules_followed, rating, ai_grade, source
    FROM journal_entries
    WHERE outcome IN ('WIN','LOSS','BE')
      -- old forex agent trades (OANDA era) aren't part of the futures journal
      AND source <> 'agent'
      AND (${opts.accountId ?? null}::uuid IS NULL OR account_id = ${opts.accountId ?? null}::uuid)
      AND (${opts.from ?? null}::date IS NULL OR trading_day >= ${opts.from ?? null}::date)
      AND (${opts.to ?? null}::date IS NULL OR trading_day <= ${opts.to ?? null}::date)
    ORDER BY exited_at NULLS LAST
  `) as Record<string, unknown>[];
  return rows.map((r) => {
    const o = { ...r } as Record<string, unknown>;
    for (const k of TRADE_NUMS) o[k] = r[k] === null ? null : Number(r[k]);
    for (const k of ["entered_at", "exited_at"]) o[k] = r[k] === null ? null : new Date(r[k] as string).toISOString();
    return o as JournalTrade;
  });
}

// ── Daily notes ─────────────────────────────────────────────────────────────

export type DailyNote = {
  trading_day: string;
  premarket_md: string | null;
  review_md: string | null;
  mood: string | null;
  rating: number | null;
  followed_plan: boolean | null;
};

export async function getNote(day: string): Promise<DailyNote | null> {
  const rows = (await sql`
    SELECT trading_day::text, premarket_md, review_md, mood, rating, followed_plan FROM daily_notes WHERE trading_day = ${day}
  `) as DailyNote[];
  return rows[0] ?? null;
}

export async function listNoteDays(from: string, to: string): Promise<{ trading_day: string; rating: number | null }[]> {
  return (await sql`
    SELECT trading_day::text, rating FROM daily_notes WHERE trading_day BETWEEN ${from} AND ${to}
  `) as { trading_day: string; rating: number | null }[];
}

export async function saveNote(day: string, n: Partial<DailyNote>): Promise<DailyNote> {
  const rows = (await sql`
    INSERT INTO daily_notes (trading_day, premarket_md, review_md, mood, rating, followed_plan, updated_at)
    VALUES (${day}, ${n.premarket_md ?? null}, ${n.review_md ?? null}, ${n.mood ?? null}, ${n.rating ?? null},
            ${n.followed_plan ?? null}, now())
    ON CONFLICT (trading_day) DO UPDATE SET
      premarket_md = EXCLUDED.premarket_md, review_md = EXCLUDED.review_md, mood = EXCLUDED.mood,
      rating = EXCLUDED.rating, followed_plan = EXCLUDED.followed_plan, updated_at = now()
    RETURNING trading_day::text, premarket_md, review_md, mood, rating, followed_plan
  `) as DailyNote[];
  return rows[0];
}

// ── Playbooks ───────────────────────────────────────────────────────────────

export type Playbook = {
  id: string;
  name: string;
  description_md: string | null;
  rules: string[];
  backtest_setup: "A" | "B" | null;
  archived: boolean;
};

export async function listPlaybooks(): Promise<Playbook[]> {
  return (await sql`
    SELECT id, name, description_md, rules, backtest_setup, archived FROM playbooks ORDER BY archived, name
  `) as Playbook[];
}

export async function savePlaybook(p: Partial<Playbook> & { id?: string }): Promise<Playbook> {
  const rules = JSON.stringify((p.rules ?? []).map((r) => String(r).trim()).filter(Boolean));
  if (p.id) {
    const rows = (await sql`
      UPDATE playbooks SET name = COALESCE(${p.name ?? null}, name), description_md = ${p.description_md ?? null},
        rules = ${rules}::jsonb, backtest_setup = ${p.backtest_setup ?? null}, archived = ${p.archived ?? false}, updated_at = now()
      WHERE id = ${p.id}
      RETURNING id, name, description_md, rules, backtest_setup, archived
    `) as Playbook[];
    if (!rows[0]) throw new Error("Playbook not found");
    return rows[0];
  }
  if (!p.name) throw new Error("Playbook name is required");
  const rows = (await sql`
    INSERT INTO playbooks (name, description_md, rules, backtest_setup)
    VALUES (${p.name}, ${p.description_md ?? null}, ${rules}::jsonb, ${p.backtest_setup ?? null})
    RETURNING id, name, description_md, rules, backtest_setup, archived
  `) as Playbook[];
  return rows[0];
}

/** Starter playbooks from the strategy we wrote together — created once if none exist. */
export async function ensureDefaultPlaybooks() {
  const n = (await sql`SELECT COUNT(*)::int AS n FROM playbooks`) as { n: number }[];
  if (n[0].n > 0) return;
  await savePlaybook({
    name: "A · Break & retest",
    backtest_setup: "A",
    description_md: "15m closes through a zone in the 1H bias direction, retest within 4 bars, 5m rejection trigger.",
    rules: [
      "Trade is in the 1H bias direction",
      "15m candle CLOSED through the zone (two closes at night)",
      "Entered on the retest, not the breakout candle",
      "5m rejection candle triggered the entry",
      "Stop beyond the zone",
      "Next zone is at least 2R away",
      "Outside news blackout",
    ],
  });
  await savePlaybook({
    name: "B · Failed break",
    backtest_setup: "B",
    description_md: "15m wick through a zone that closes back inside; trade back toward the opposite side.",
    rules: [
      "15m wicked through the zone and CLOSED back inside",
      "5m candle confirmed the reversal",
      "Stop beyond the wick",
      "Next zone is at least 2R away",
      "Under 2 losses today",
    ],
  });
}

// ── Trade review fields ─────────────────────────────────────────────────────

export async function updateTradeReview(
  id: string,
  p: { playbook_id?: string | null; rules_followed?: string[]; rating?: number | null; setup_type?: string | null; stop_loss?: number | null }
) {
  const cur = (await sql`SELECT direction, entry_price, exit_price, stop_loss FROM journal_entries WHERE id = ${id}`) as {
    direction: string;
    entry_price: string | null;
    exit_price: string | null;
    stop_loss: string | null;
  }[];
  if (!cur[0]) return null;
  const stop = p.stop_loss !== undefined ? p.stop_loss : cur[0].stop_loss === null ? null : Number(cur[0].stop_loss);
  const entry = cur[0].entry_price === null ? null : Number(cur[0].entry_price);
  const exit = cur[0].exit_price === null ? null : Number(cur[0].exit_price);
  const sign = cur[0].direction === "LONG" ? 1 : -1;
  const r = stop !== null && entry !== null && exit !== null && entry !== stop ? Math.round(((sign * (exit - entry)) / Math.abs(entry - stop)) * 100) / 100 : null;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k);
  const rows = await sql`
    UPDATE journal_entries SET
      playbook_id    = CASE WHEN ${has("playbook_id")} THEN ${p.playbook_id ?? null}::uuid ELSE playbook_id END,
      rules_followed = CASE WHEN ${has("rules_followed")} THEN ${p.rules_followed ?? []}::text[] ELSE rules_followed END,
      rating         = CASE WHEN ${has("rating")} THEN ${p.rating ?? null}::int ELSE rating END,
      setup_type     = CASE WHEN ${has("setup_type")} THEN ${p.setup_type ?? null} ELSE setup_type END,
      stop_loss      = ${stop},
      r_multiple     = CASE WHEN ${stop !== null} THEN ${r} ELSE r_multiple END,
      updated_at     = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ?? null;
}
