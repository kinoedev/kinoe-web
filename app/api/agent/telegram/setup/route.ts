import { NextRequest, NextResponse } from "next/server";
import { registerWebhook, deleteWebhook } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set." }, { status: 400 });
  }

  // Hard-code the webhook URL for kinoe.dev
  const webhookUrl = "https://kinoe.dev/api/agent/telegram/webhook";

  console.log(`[Telegram Setup] Deleting old webhook...`);
  await deleteWebhook(token);

  console.log(`[Telegram Setup] Registering new webhook: ${webhookUrl}`);
  const result = await registerWebhook(token, webhookUrl);
  console.log(`[Telegram Setup] Result:`, result);

  return NextResponse.json({
    ok: result.ok,
    webhookUrl,
    error: result.error,
    message: result.ok ? "Webhook registered successfully" : "Webhook registration failed",
  }, { status: result.ok ? 200 : 400 });
}
