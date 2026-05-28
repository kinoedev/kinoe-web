import type { AgentCandidate } from "./db/types";

const TELEGRAM_API = "https://api.telegram.org";

function botUrl(token: string, method: string) {
  return `${TELEGRAM_API}/bot${token}/${method}`;
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  inlineKeyboard?: { text: string; callback_data: string }[][]
): Promise<{ ok: boolean; message_id?: number; error?: string }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  try {
    const res = await fetch(botUrl(token, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
    if (data.ok) return { ok: true, message_id: data.result?.message_id };
    return { ok: false, error: data.description ?? "Telegram error" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

export async function editTelegramMessage(
  token: string,
  chatId: string,
  messageId: string,
  text: string
): Promise<void> {
  await fetch(botUrl(token, "editMessageText"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: Number(messageId),
      text,
      parse_mode: "HTML",
    }),
  });
}

export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text: string
): Promise<void> {
  await fetch(botUrl(token, "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

export async function registerWebhook(token: string, webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(botUrl(token, "setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    return { ok: data.ok, error: data.description };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

export function buildCandidateAlert(candidate: AgentCandidate, positionSizeText?: string): {
  text: string;
  keyboard: { text: string; callback_data: string }[][];
} {
  const dir = candidate.direction ?? "?";
  const pair = candidate.pair.replace("_", "/");
  const score = candidate.confidence_score ?? "?";
  const rr = candidate.risk_reward != null ? Number(candidate.risk_reward).toFixed(1) : "?";
  const setup = candidate.setup_type ?? "Unknown setup";
  const status = candidate.trade_status ?? "?";
  const sl = candidate.stop_loss ? Number(candidate.stop_loss).toFixed(5) : "?";
  const tp = candidate.take_profit ? Number(candidate.take_profit).toFixed(5) : "?";

  const blockers = candidate.blockers?.length
    ? candidate.blockers.map((b) => `- ${b}`).join("\n")
    : "None";

  const triggers = (candidate.trigger_conditions as string[] | undefined)?.length
    ? (candidate.trigger_conditions as string[]).map((t) => `- ${t}`).join("\n")
    : "- See analysis";

  // Pull confidence factors and structure note from analysis_json
  const analysis = candidate.analysis_json as Record<string, unknown> | null;
  const breakdown = analysis?.confidenceBreakdown as { factors?: string[] } | undefined;
  const topFactors = breakdown?.factors?.slice(0, 4) ?? [];
  const structureNote = (analysis?.structureAnalysis as { note?: string } | undefined)?.note ?? "";
  const riskPips = (analysis?.potentialTradePlan as { riskPips?: number } | undefined)?.riskPips;
  const m15Plan = analysis?.m15EntryPlan as { direction?: string; stopLoss?: number; takeProfit?: number; riskReward?: number; riskPips?: number } | null;
  const m15SetupType = analysis?.m15SetupType as string | null;

  const factorsLine = topFactors.length
    ? topFactors.map((f) => `  ${f}`).join("\n")
    : "  No breakdown available";

  let text =
    `<b>KINOE - Setup Found</b>\n\n` +
    `<b>${pair} ${dir}</b>\n` +
    `Score: <b>${score}</b> | RR: ${rr}:1${riskPips ? ` | Risk: ${riskPips} pips` : ""}\n` +
    `Status: ${status} | Setup: ${setup}\n\n` +
    `<b>SL:</b> <code>${sl}</code>\n` +
    `<b>TP:</b> <code>${tp}</code>\n` +
    (positionSizeText ? `<b>Size:</b> ${positionSizeText}\n` : "") +
    `\n<b>Why this scored ${score}:</b>\n${factorsLine}\n\n` +
    `<b>Trigger:</b>\n${triggers}`;

  if (structureNote) {
    text += `\n\n<b>Structure:</b> ${structureNote}`;
  }

  if (m15Plan && m15SetupType) {
    const m15Sl = m15Plan.stopLoss ? Number(m15Plan.stopLoss).toFixed(5) : "?";
    const m15Tp = m15Plan.takeProfit ? Number(m15Plan.takeProfit).toFixed(5) : "?";
    const m15Rr = m15Plan.riskReward ?? "?";
    const m15Pips = m15Plan.riskPips ? ` · ${m15Plan.riskPips} pips` : "";
    text += `\n\n<b>📍 M15 Entry (${m15SetupType}):</b>\nSL: <code>${m15Sl}</code> · TP: <code>${m15Tp}</code> · RR ${m15Rr}:1${m15Pips}`;
  }

  const blockersText = candidate.blockers?.length ? blockers : null;
  if (blockersText) {
    text += `\n\n<b>Blockers:</b>\n${blockersText}`;
  }

  const keyboard = [
    [
      { text: "Approve", callback_data: `approve:${candidate.id}` },
      { text: "Deny",    callback_data: `deny:${candidate.id}` },
    ],
    [
      { text: "Journal Only", callback_data: `journal:${candidate.id}` },
    ],
  ];

  return { text, keyboard };
}
