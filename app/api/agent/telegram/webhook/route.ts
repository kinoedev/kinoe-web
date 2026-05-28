import { NextRequest, NextResponse } from "next/server";
import {
  getAgentCandidate,
  updateCandidateDecision,
  createJournalEntry,
  getAgentSettings,
} from "@/lib/db/queries";
import { answerCallbackQuery, editTelegramMessage } from "@/lib/telegram";
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

const DECISION_LABELS: Record<string, string> = {
  approve:  "✅ Approved — logged to journal",
  deny:     "❌ Denied",
  journal:  "📓 Journalled (no trade)",
};

export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;
    const cq = update.callback_query;

    if (!cq?.data) {
      return NextResponse.json({ ok: true });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;

    // Always answer the callback to remove the loading spinner in Telegram
    if (token) {
      await answerCallbackQuery(token, cq.id, "Processing...");
    }

    const [action, candidateId] = cq.data.split(":");
    if (!action || !candidateId) {
      return NextResponse.json({ ok: true });
    }

    const candidate = await getAgentCandidate(candidateId);
    if (!candidate) {
      return NextResponse.json({ ok: true });
    }

    // Ignore duplicate taps (already decided)
    if (candidate.decision !== "PENDING") {
      if (token && cq.message) {
        await answerCallbackQuery(token, cq.id, `Already ${candidate.decision}`);
      }
      return NextResponse.json({ ok: true });
    }

    let decision: CandidateDecision = "DENIED";
    let journalEntryId: string | undefined;

    if (action === "approve") {
      decision = "APPROVED";

      // Auto-log approved trade to journal
      const settings = await getAgentSettings();
      void settings; // referenced for potential future use

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
            entered_at: new Date().toISOString(),
            source: "agent_signal",
            thesis_md: buildThesisMd(candidate),
          });
          journalEntryId = entry.id;
        } catch {
          // Journal write failure shouldn't block the decision
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
            source: "agent_signal",
            thesis_md: buildThesisMd(candidate),
          });
          journalEntryId = entry.id;
        } catch {
          // Journal write failure shouldn't block the decision
        }
      }
    }

    await updateCandidateDecision(candidateId, decision, {
      reason: `Telegram: ${action}`,
      journal_entry_id: journalEntryId,
    });

    // Edit the original Telegram message to show the outcome
    if (token && cq.message) {
      const label = DECISION_LABELS[action] ?? action;
      await editTelegramMessage(
        token,
        String(cq.message.chat.id),
        String(cq.message.message_id),
        `*${candidate.pair.replace("_", "/")} ${candidate.direction ?? ""}*\n` +
        `Score: ${candidate.confidence_score} · RR: ${candidate.risk_reward?.toFixed(1) ?? "?"}:1\n\n` +
        `${label}${journalEntryId ? "\nJournal entry created." : ""}`
      );
    }

    return NextResponse.json({ ok: true, decision, journalEntryId });
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
