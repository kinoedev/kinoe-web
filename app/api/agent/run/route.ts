import { NextRequest, NextResponse } from "next/server";
import { parseCandles, runFullPairAnalysis } from "@/lib/signals/detection";
import {
  getAgentSettings,
  createAgentRun,
  createAgentCandidate,
  countTodayApprovedTrades,
} from "@/lib/db/queries";
import { sendTelegramMessage, buildCandidateAlert } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const start = Date.now();
  const triggeredBy = req.headers.get("x-triggered-by") ?? "manual";

  try {
    const settings = await getAgentSettings();

    if (settings.kill_switch) {
      return NextResponse.json({ ok: false, reason: "Kill switch is enabled." });
    }

    if (settings.agent_mode === "OFF") {
      return NextResponse.json({ ok: false, reason: "Agent mode is OFF." });
    }

    const apiKey = process.env.OANDA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, reason: "Missing OANDA_API_KEY." }, { status: 500 });
    }

    const baseUrl =
      (process.env.OANDA_ACCOUNT_TYPE ?? "practice") === "live"
        ? "https://api-fxtrade.oanda.com"
        : "https://api-fxpractice.oanda.com";

    // Respect daily trade cap
    const todayTrades = await countTodayApprovedTrades();
    const remainingSlots = settings.max_trades_per_day - todayTrades;

    if (remainingSlots <= 0) {
      const run = await createAgentRun({
        triggered_by: triggeredBy,
        pairs_scanned: settings.allowed_pairs,
        candidates_found: 0,
        trades_taken: 0,
        error: "Daily trade limit reached.",
        duration_ms: Date.now() - start,
      });
      return NextResponse.json({ ok: true, run, reason: "Daily trade limit reached." });
    }

    // Fetch candles + run rule engine for all allowed pairs
    const analyses = await Promise.all(
      settings.allowed_pairs.map(async (pair) => {
        const [h4Res, d1Res] = await Promise.all([
          fetch(`${baseUrl}/v3/instruments/${pair}/candles?granularity=H4&count=100&price=M`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
            cache: "no-store",
          }),
          fetch(`${baseUrl}/v3/instruments/${pair}/candles?granularity=D&count=50&price=M`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
            cache: "no-store",
          }),
        ]);
        const [h4Data, d1Data] = await Promise.all([h4Res.json(), d1Res.json()]);
        const h4Candles = parseCandles(h4Data.candles ?? []);
        const d1Candles = parseCandles(d1Data.candles ?? []);
        return runFullPairAnalysis(pair, h4Candles, d1Candles);
      })
    );

    // Create the run record first so we have a run_id
    const run = await createAgentRun({
      triggered_by: triggeredBy,
      pairs_scanned: settings.allowed_pairs,
      candidates_found: 0,
      trades_taken: 0,
      duration_ms: null,
    });

    const alerted: string[] = [];

    for (const analysis of analyses) {
      // Apply filters
      if (
        analysis.confidenceScore < settings.min_confidence_score ||
        analysis.tradeStatus === "AVOID" ||
        analysis.tradeStatus === "NO_TRADE"
      ) {
        continue;
      }

      const rr = analysis.potentialTradePlan?.riskReward ?? 0;
      if (rr < settings.min_risk_reward) continue;

      if (!settings.allowed_timeframes.includes(analysis.timeframe)) continue;

      // Direction from bias
      const direction =
        analysis.executionTimeframeBias === "BULLISH" ? "LONG"
        : analysis.executionTimeframeBias === "BEARISH" ? "SHORT"
        : null;

      const candidate = await createAgentCandidate({
        run_id: run.id,
        pair: analysis.pair,
        timeframe: analysis.timeframe,
        direction,
        setup_type: analysis.setupType,
        confidence_score: analysis.confidenceScore,
        trade_status: analysis.tradeStatus,
        risk_reward: rr || null,
        entry_price: null,
        stop_loss: analysis.potentialTradePlan?.stopLoss ?? null,
        take_profit: analysis.potentialTradePlan?.takeProfit ?? null,
        blockers: analysis.blockers,
        trigger_conditions: analysis.triggerConditions,
        analysis_json: analysis,
      });

      // Send Telegram alert if configured
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = settings.telegram_chat_id ?? process.env.TELEGRAM_CHAT_ID;

      if (token && chatId) {
        const { text, keyboard } = buildCandidateAlert(candidate);
        const result = await sendTelegramMessage(token, chatId, text, keyboard);
        if (result.ok && result.message_id) {
          // Store message ID so we can edit it when decision comes in
          const { updateCandidateDecision } = await import("@/lib/db/queries");
          await updateCandidateDecision(candidate.id, "PENDING", {
            telegram_message_id: String(result.message_id),
          });
        }
        alerted.push(candidate.pair);
      }
    }

    // Update run with final counts
    const { sql } = await import("@/lib/db/client");
    await sql`
      UPDATE agent_runs SET
        candidates_found = ${alerted.length},
        duration_ms      = ${Date.now() - start}
      WHERE id = ${run.id}
    `;

    return NextResponse.json({
      ok: true,
      run_id: run.id,
      candidates: alerted.length,
      alerted,
      duration_ms: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Agent run failed" },
      { status: 500 }
    );
  }
}
