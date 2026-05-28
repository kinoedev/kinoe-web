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
    `<b>KINOE Agent - Test Message</b>\n\nYour Telegram alerts are working.\n\nTrade alerts will look like:\n\n<b>XAU/USD SHORT</b>\nScore: 82 | RR: 3.2:1\nStatus: TRADE_READY\nSetup: Bearish Kangaroo Tail\n\nSL: <code>2380.00000</code>\nTP: <code>2240.00000</code>\n\nWith Approve / Deny / Journal buttons.`,
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message_id: result.message_id });
}
