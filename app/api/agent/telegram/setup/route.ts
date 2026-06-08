import { NextRequest, NextResponse } from "next/server";
import { registerWebhook } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set." }, { status: 400 });
  }

  // Derive the site URL from the request origin header or NEXTAUTH_URL
  const origin =
    req.headers.get("origin") ??
    req.headers.get("x-forwarded-host") ??
    process.env.NEXTAUTH_URL ??
    process.env.VERCEL_URL;

  if (!origin) {
    return NextResponse.json({
      ok: false,
      error: "Cannot determine site URL. Set VERCEL_URL or NEXTAUTH_URL in environment variables.",
    }, { status: 400 });
  }

  const webhookUrl = origin.startsWith("http")
    ? `${origin}/api/agent/telegram/webhook`
    : `https://${origin}/api/agent/telegram/webhook`;

  console.log(`[Telegram Setup] Registering webhook: ${webhookUrl}`);
  const result = await registerWebhook(token, webhookUrl);
  console.log(`[Telegram Setup] Result:`, result);

  return NextResponse.json({
    ok: result.ok,
    webhookUrl,
    error: result.error,
    message: result.ok ? "Webhook registered successfully" : "Webhook registration failed",
  }, { status: result.ok ? 200 : 400 });
}
