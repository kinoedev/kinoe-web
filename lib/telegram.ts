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

export function buildCandidateAlert(candidate: AgentCandidate): {
  text: string;
  keyboard: { text: string; callback_data: string }[][];
} {
  const dir = candidate.direction ?? "?";
  const pair = candidate.pair.replace("_", "/");
  const score = candidate.confidence_score ?? "?";
  const rr = Number(candidate.risk_reward).toFixed(1) ?? "?";
  const setup = candidate.setup_type ?? "Unknown setup";
  const status = candidate.trade_status ?? "?";
  const sl = candidate.stop_loss ? Number(candidate.stop_loss).toFixed(5) : "?";
  const tp = candidate.take_profit ? Number(candidate.take_profit).toFixed(5) : "?";
  const blockers = candidate.blockers?.length
    ? candidate.blockers.join(", ")
    : "None";
  const triggers = (candidate.trigger_conditions as string[] | undefined)?.length
    ? (candidate.trigger_conditions as string[]).join("\n- ")
    : "See analysis";

  const text =
    `<b>KINOE Agent - Setup Found</b>\n\n` +
    `<b>${pair} ${dir}</b>\n` +
    `Score: ${score} | RR: ${rr}:1\n` +
    `Status: ${status}\n` +
    `Setup: ${setup}\n\n` +
    `SL: <code>${sl}</code>\n` +
    `TP: <code>${tp}</code>\n\n` +
    `Trigger:\n- ${triggers}\n\n` +
    `Blockers: ${blockers}`;

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
