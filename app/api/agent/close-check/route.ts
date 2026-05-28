// Polls OANDA for closure of any open agent_orders.
// Call this route on a schedule (e.g., every 15 min via cron or the agent run).
// Matching strategy: same pair + direction + openTime within 6 hours of journal entered_at.

import { NextResponse } from "next/server";
import {
  listOpenAgentOrders,
  closeAgentOrder,
  stampOrderCloseChecked,
  closeJournalEntry,
  getAgentSettings,
} from "@/lib/db/queries";
import { getRecentClosedTrades } from "@/lib/oanda/account";
import { sendTelegramMessage } from "@/lib/telegram";

const MATCH_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

function calcOutcome(openPrice: number, closePrice: number, direction: string, sl: number | null): "WIN" | "LOSS" | "BE" {
  const pnl = direction === "LONG" ? closePrice - openPrice : openPrice - closePrice;
  if (Math.abs(pnl) < 0.00001) return "BE";
  if (pnl > 0) return "WIN";
  return "LOSS";
}

function calcRMultiple(openPrice: number, closePrice: number, sl: number, direction: string): number {
  const risk = Math.abs(openPrice - sl);
  if (risk === 0) return 0;
  const pnl = direction === "LONG" ? closePrice - openPrice : openPrice - closePrice;
  return Number((pnl / risk).toFixed(2));
}

export async function POST() {
  const apiKey = process.env.OANDA_API_KEY;
  const accountId = process.env.OANDA_ACCOUNT_ID;
  const baseUrl = process.env.OANDA_BASE_URL ?? "https://api-fxpractice.oanda.com";

  if (!apiKey || !accountId) {
    return NextResponse.json({ ok: false, error: "OANDA credentials not configured" }, { status: 500 });
  }

  const orders = await listOpenAgentOrders();
  if (orders.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, closed: 0 });
  }

  // Fetch recent closed trades from OANDA per unique pair (batch)
  const pairs = [...new Set(orders.map((o) => o.pair))];
  const closedByPair = new Map<string, Awaited<ReturnType<typeof getRecentClosedTrades>>>();
  await Promise.all(
    pairs.map(async (pair) => {
      try {
        const trades = await getRecentClosedTrades(accountId, apiKey, baseUrl, pair, 50);
        closedByPair.set(pair, trades);
      } catch {
        closedByPair.set(pair, []);
      }
    })
  );

  let closed = 0;
  const settings = await getAgentSettings();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = settings.telegram_chat_id;

  for (const order of orders) {
    const closedTrades = closedByPair.get(order.pair) ?? [];
    const enteredAt = order.created_at; // fallback if no journal_entry entered_at
    const enteredMs = new Date(enteredAt).getTime();

    // Find OANDA trade that matches: same direction + opened within MATCH_WINDOW_MS of our order
    const match = closedTrades.find((t) => {
      if (t.direction !== order.direction) return false;
      const oandaOpenMs = new Date(t.openTime).getTime();
      return Math.abs(oandaOpenMs - enteredMs) <= MATCH_WINDOW_MS;
    });

    if (!match) {
      await stampOrderCloseChecked(order.id);
      continue;
    }

    const openPrice = order.open_price ?? match.openPrice;
    const direction = order.direction ?? "LONG";
    const outcome = calcOutcome(openPrice, match.closePrice, direction, order.stop_loss);
    const rMultiple = order.stop_loss
      ? calcRMultiple(openPrice, match.closePrice, order.stop_loss, direction)
      : 0;

    // Update agent_order
    await closeAgentOrder(order.id, {
      close_price: match.closePrice,
      realized_pnl: match.realizedPL,
      closed_at: match.closeTime,
      oanda_trade_id: match.id,
    });

    // Auto-close the linked journal entry
    if (order.journal_entry_id) {
      await closeJournalEntry(order.journal_entry_id, {
        exit_price: match.closePrice,
        realized_pnl: match.realizedPL,
        r_multiple: rMultiple,
        outcome,
        exited_at: match.closeTime,
      });
    }

    closed++;

    // Send Telegram review prompt
    if (token && chatId) {
      const pair = order.pair.replace("_", "/");
      const icon = outcome === "WIN" ? "✅" : outcome === "LOSS" ? "❌" : "⚪️";
      const rrText = rMultiple !== 0 ? ` ${rMultiple > 0 ? "+" : ""}${rMultiple}R` : "";
      const pnlText = match.realizedPL !== 0 ? ` ($${match.realizedPL.toFixed(2)})` : "";

      const text =
        `<b>KINOE — Trade Closed</b>\n\n` +
        `${icon} <b>${pair} ${direction}</b> — <b>${outcome}</b>${rrText}${pnlText}\n` +
        `Open: <code>${openPrice}</code> → Close: <code>${match.closePrice}</code>\n\n` +
        `This was an <b>agent signal</b>.\n\n` +
        `<i>Why did you approve this trade? What did you see that matched your rules?</i>\n` +
        `(Reply to reflect — your answer will be saved to the journal)`;

      await sendTelegramMessage(token, chatId, text).catch(() => null);
    }
  }

  return NextResponse.json({ ok: true, checked: orders.length, closed });
}

export async function GET() {
  return POST();
}
