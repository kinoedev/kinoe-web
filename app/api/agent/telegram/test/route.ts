import { NextResponse } from "next/server";
import { getAgentSettings } from "@/lib/db/queries";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set in environment variables." }, { status: 400 });
  }

  const settings = await getAgentSettings();
  const chatId = settings.telegram_chat_id ?? process.env.TELEGRAM_CHAT_ID;

  if (!chatId) {
    return NextResponse.json({
      ok: false,
      error: "No Telegram chat ID configured. Set it in Agent settings or as TELEGRAM_CHAT_ID env var.",
    }, { status: 400 });
  }

  const result = await sendTelegramMessage(
    token,
    chatId,
    "*KINOE Agent — Test Message*\n\nYour Telegram alerts are working correctly.\n\nThe bot will send you trade setups that look like this:\n\n*XAU/USD SHORT*\nScore: 82 · RR: 3.2:1\nStatus: TRADE_READY\nSetup: Bearish Kangaroo Tail\n\nEntry: `2,345.00`\nSL: `2,380.00`\nTP: `2,240.00`\n\nWith Approve / Deny / Journal buttons.",
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message_id: result.message_id });
}
