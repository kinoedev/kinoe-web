import { NextRequest, NextResponse } from "next/server";
import {
  getAgentCandidate,
  updateCandidateDecision,
  createJournalEntry,
  getAgentSettings,
  createAgentOrder,
  closeAgentOrder,
} from "@/lib/db/queries";
import { answerCallbackQuery, editTelegramMessage, sendTelegramMessage } from "@/lib/telegram";
import { placeStopOrder } from "@/lib/oanda/orders";
import { getAccountBalance } from "@/lib/oanda/account";
import { calculatePositionSize } from "@/lib/broker/sizing";
import type { CandidateDecision } from "@/lib/db/types";

type TelegramUpdate = {
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number };
    };
  };
};

export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;
    const cq = update.callback_query;

    if (!cq?.data) return NextResponse.json({ ok: true });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) await answerCallbackQuery(token, cq.id, "Processing...");

    const [action, candidateId] = cq.data.split(":");
    if (!action || !candidateId) return NextResponse.json({ ok: true });

    const candidate = await getAgentCandidate(candidateId);
    if (!candidate) return NextResponse.json({ ok: true });

    if (candidate.decision !== "PENDING") {
      if (token) await answerCallbackQuery(token, cq.id, `Already ${candidate.decision}`);
      return NextResponse.json({ ok: true });
    }

    let decision: CandidateDecision = "DENIED";
    let journalEntryId: string | undefined;
    let executionNote = "";

    if (action === "approve") {
      decision = "APPROVED";

      if (candidate.direction === "LONG" || candidate.direction === "SHORT") {
        const settings = await getAgentSettings();
        const apiKey = process.env.OANDA_API_KEY;
        const accountId = process.env.OANDA_ACCOUNT_ID;
        const baseUrl = (process.env.OANDA_ACCOUNT_TYPE ?? "practice") === "live"
          ? "https://api-fxtrade.oanda.com"
          : "https://api-fxpractice.oanda.com";

        // Fetch live balance for accurate position sizing
        const balance = apiKey && accountId
          ? await getAccountBalance(accountId, apiKey, baseUrl)
          : null;

        // Calculate units
        let units = 1000; // fallback minimum
        if (balance && candidate.entry_price && candidate.stop_loss) {
          const sizeResult = calculatePositionSize(
            Number(candidate.entry_price),
            Number(candidate.stop_loss),
            balance,
            Number(settings.max_risk_per_trade_pct) || 0.01,
            candidate.pair
          );
          if (sizeResult.ok && sizeResult.units > 0) units = sizeResult.units;
        }

        // Place stop order on OANDA
        let oandaOrderId: string | undefined;
        let oandaTradeId: string | undefined;

        if (apiKey && accountId && candidate.entry_price && candidate.stop_loss && candidate.take_profit) {
          const orderResult = await placeStopOrder(accountId, apiKey, baseUrl, {
            instrument: candidate.pair,
            direction: candidate.direction,
            units,
            entryPrice: Number(candidate.entry_price),
            stopLoss: Number(candidate.stop_loss),
            takeProfit: Number(candidate.take_profit),
          });

          if (orderResult.ok) {
            oandaOrderId = orderResult.orderId;
            oandaTradeId = orderResult.tradeId;
            executionNote = `✅ Order placed on OANDA\nUnits: ${units.toLocaleString()}${oandaOrderId ? ` · Order #${oandaOrderId}` : ""}`;
          } else {
            executionNote = `⚠️ OANDA order failed: ${orderResult.error}`;
          }
        } else {
          executionNote = "⚠️ Skipped OANDA execution — missing price data or credentials";
        }

        // Create journal entry
        try {
          const entry = await createJournalEntry({
            pair: candidate.pair,
            timeframe: candidate.timeframe,
            direction: candidate.direction,
            setup_type: candidate.setup_type ?? undefined,
            entry_price: candidate.entry_price ?? undefined,
            stop_loss: candidate.stop_loss ?? undefined,
            take_profit: candidate.take_profit ?? undefined,
            risk_reward: candidate.risk_reward ?? undefined,
            entered_at: new Date().toISOString(),
            source: "agent",
            thesis_md: buildThesisMd(candidate),
          });
          journalEntryId = entry.id;

          // Create agent_order row linking to journal + OANDA IDs
          const order = await createAgentOrder({
            candidate_id: candidate.id,
            journal_entry_id: entry.id,
            pair: candidate.pair,
            direction: candidate.direction,
            oanda_account_id: accountId ?? null,
            open_price: candidate.entry_price ?? null,
            stop_loss: candidate.stop_loss ?? null,
            take_profit: candidate.take_profit ?? null,
          });

          // If trade filled immediately (rare for stops), mark order closed
          if (oandaTradeId && order) {
            await closeAgentOrder(order.id, {
              close_price: Number(candidate.entry_price),
              realized_pnl: 0,
              closed_at: new Date().toISOString(),
              oanda_trade_id: oandaTradeId,
            });
          }
        } catch {
          // Journal failure doesn't block the decision
        }
      }

    } else if (action === "journal") {
      decision = "JOURNAL_ONLY";
      if (candidate.direction === "LONG" || candidate.direction === "SHORT") {
        try {
          const entry = await createJournalEntry({
            pair: candidate.pair,
            timeframe: candidate.timeframe,
            direction: candidate.direction,
            setup_type: candidate.setup_type ?? undefined,
            stop_loss: candidate.stop_loss ?? undefined,
            take_profit: candidate.take_profit ?? undefined,
            risk_reward: candidate.risk_reward ?? undefined,
            source: "agent",
            thesis_md: buildThesisMd(candidate),
          });
          journalEntryId = entry.id;
          executionNote = "📓 Logged to journal — no OANDA order placed";
        } catch {
          //
        }
      }
    } else {
      // deny
      executionNote = "❌ Denied — no order placed";
    }

    await updateCandidateDecision(candidateId, decision, {
      reason: `Telegram: ${action}`,
      journal_entry_id: journalEntryId,
    });

    // Update the Telegram message with execution result
    if (token && cq.message) {
      const pair = candidate.pair.replace("_", "/");
      const dir = candidate.direction ?? "";
      const rr = candidate.risk_reward != null ? `${Number(candidate.risk_reward).toFixed(1)}:1` : "?";
      await editTelegramMessage(
        token,
        String(cq.message.chat.id),
        String(cq.message.message_id),
        `<b>${pair} ${dir}</b> · Score: ${candidate.confidence_score} · RR: ${rr}\n\n${executionNote}`
      );
    }

    // If OANDA order failed, send a follow-up message so it's visible
    if (action === "approve" && executionNote.startsWith("⚠️") && token) {
      const chatId = cq.message?.chat.id
        ? String(cq.message.chat.id)
        : (await getAgentSettings()).telegram_chat_id;
      if (chatId) {
        await sendTelegramMessage(token, chatId,
          `<b>⚠️ Execution issue on ${candidate.pair.replace("_", "/")}</b>\n${executionNote}\n\nCheck OANDA credentials or place manually.`
        );
      }
    }

    return NextResponse.json({ ok: true, decision, journalEntryId, executionNote });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: true }); // Always 200 to Telegram
  }
}

function buildThesisMd(c: Awaited<ReturnType<typeof getAgentCandidate>>): string {
  if (!c) return "";
  const lines = [
    `**${c.pair.replace("_", "/")} ${c.direction ?? ""} — Agent Signal**`,
    "",
    `- Setup: ${c.setup_type ?? "Unknown"}`,
    `- Confidence: ${c.confidence_score ?? "?"}`,
    `- Trade status: ${c.trade_status ?? "?"}`,
    `- RR: ${c.risk_reward?.toFixed(1) ?? "?"}:1`,
  ];
  if ((c.trigger_conditions as string[] | undefined)?.length) {
    lines.push("", "**Trigger:**");
    for (const t of c.trigger_conditions as string[]) lines.push(`- ${t}`);
  }
  if (c.blockers?.length) {
    lines.push("", "**Blockers at signal time:**");
    for (const b of c.blockers) lines.push(`- ${b}`);
  }
  return lines.join("\n");
}
