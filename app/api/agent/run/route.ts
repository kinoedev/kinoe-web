import { NextRequest, NextResponse } from "next/server";
import { scanPairs } from "@/lib/agent/scanner";
import { runGlobalRiskChecks } from "@/lib/risk/engine";
import {
  getAgentSettings,
  createAgentRun,
  createAgentCandidate,
  countTodayApprovedTrades,
  updateCandidateDecision,
} from "@/lib/db/queries";
import { sendTelegramMessage, buildCandidateAlert } from "@/lib/telegram";
import { sql } from "@/lib/db/client";
import { getAccountBalance } from "@/lib/oanda/account";
import { calculatePositionSize, formatSizeForTelegram } from "@/lib/broker/sizing";

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

    // Session gate: only scan during enabled H4-close sessions (skip for manual triggers)
    if (triggeredBy !== "manual" && settings.scan_sessions?.length > 0) {
      const utcHour = new Date().getUTCHours();
      const SESSION_HOURS: Record<string, number[]> = {
        asian: [0, 4],
        london: [8, 12],
        new_york: [12, 16, 20],
      };
      const activeSessions = settings.scan_sessions.filter((s) =>
        SESSION_HOURS[s]?.includes(utcHour)
      );
      if (activeSessions.length === 0) {
        return NextResponse.json({
          ok: false,
          reason: `Outside scan sessions (${settings.scan_sessions.join(", ")}). UTC hour: ${utcHour}.`,
        });
      }
    }

    const apiKey = process.env.OANDA_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, reason: "Missing OANDA_API_KEY." }, { status: 500 });
    }

    // Daily trade cap
    const todayTrades = await countTodayApprovedTrades();
    if (todayTrades >= settings.max_trades_per_day) {
      const run = await createAgentRun({
        triggered_by: triggeredBy,
        pairs_scanned: settings.allowed_pairs,
        candidates_found: 0,
        trades_taken: 0,
        error: "Daily trade limit reached.",
        duration_ms: Date.now() - start,
      });
      return NextResponse.json({ ok: true, run_id: run.id, reason: "Daily trade limit reached." });
    }

    // Global risk checks (consecutive loss cooldown, etc.)
    const riskReport = await runGlobalRiskChecks(settings);
    if (!riskReport.pass) {
      const blocked = riskReport.checks.find((c) => !c.result.pass)!;
      const run = await createAgentRun({
        triggered_by: triggeredBy,
        pairs_scanned: settings.allowed_pairs,
        candidates_found: 0,
        trades_taken: 0,
        error: `Risk check failed: ${blocked.result.reason} ${blocked.result.detail ?? ""}`.trim(),
        duration_ms: Date.now() - start,
      });
      return NextResponse.json({ ok: false, run_id: run.id, reason: blocked.result.reason, detail: blocked.result.detail });
    }

    const baseUrl =
      (process.env.OANDA_ACCOUNT_TYPE ?? "practice") === "live"
        ? "https://api-fxtrade.oanda.com"
        : "https://api-fxpractice.oanda.com";

    // Fetch account balance once for position sizing (non-blocking — null means skip sizing)
    const accountId = process.env.OANDA_ACCOUNT_ID ?? "";
    const accountBalance = await getAccountBalance(accountId, apiKey, baseUrl);

    // Scan all pairs (fetches candles + runs analysis + applies volatility gate per pair)
    const { analyses, skipped, errors } = await scanPairs({
      pairs: settings.allowed_pairs,
      oandaApiKey: apiKey,
      oandaBaseUrl: baseUrl,
      volatilityGateEnabled: settings.volatility_gate_enabled,
      maxAdrMultiplier: Number(settings.max_adr_multiplier),
      newsBlackoutEnabled: settings.news_blackout_enabled,
      newsBlackoutMinutes: settings.news_blackout_minutes,
    });

    const run = await createAgentRun({
      triggered_by: triggeredBy,
      pairs_scanned: settings.allowed_pairs,
      candidates_found: 0,
      trades_taken: 0,
      duration_ms: null,
    });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = settings.telegram_chat_id ?? process.env.TELEGRAM_CHAT_ID;
    const alerted: string[] = [];

    for (const analysis of analyses) {
      if (
        analysis.confidenceScore < settings.min_confidence_score ||
        analysis.tradeStatus === "AVOID" ||
        analysis.tradeStatus === "NO_TRADE"
      ) continue;

      const rr = analysis.potentialTradePlan?.riskReward ?? 0;
      if (rr < Number(settings.min_risk_reward)) continue;
      if (!settings.allowed_timeframes.includes(analysis.timeframe)) continue;

      const direction =
        analysis.executionTimeframeBias === "BULLISH" ? "LONG"
        : analysis.executionTimeframeBias === "BEARISH" ? "SHORT"
        : null;

      const plan = analysis.potentialTradePlan;

      // Derive entry price from the plan: entry = (tp + sl × rr) / (1 + rr)
      const derivedEntry = plan
        ? Number(((plan.takeProfit + plan.stopLoss * plan.riskReward) / (1 + plan.riskReward)).toFixed(5))
        : null;

      // Position sizing — requires account balance + a valid SL distance
      let positionSizeText: string | null = null;
      if (accountBalance && derivedEntry && plan?.stopLoss) {
        const riskPct = Number(settings.max_risk_per_trade_pct) || 0.01;
        const sizeResult = calculatePositionSize(
          derivedEntry,
          plan.stopLoss,
          accountBalance,
          riskPct,
          analysis.pair
        );
        positionSizeText = formatSizeForTelegram(sizeResult, analysis.pair);
      }

      const candidate = await createAgentCandidate({
        run_id: run.id,
        pair: analysis.pair,
        timeframe: analysis.timeframe,
        direction,
        setup_type: analysis.setupType,
        confidence_score: analysis.confidenceScore,
        trade_status: analysis.tradeStatus,
        risk_reward: rr || null,
        entry_price: derivedEntry,
        stop_loss: plan?.stopLoss ?? null,
        take_profit: plan?.takeProfit ?? null,
        blockers: analysis.blockers,
        trigger_conditions: analysis.triggerConditions,
        analysis_json: { ...analysis, positionSizeText },
      });

      if (token && chatId) {
        const { text, keyboard } = buildCandidateAlert(candidate, positionSizeText ?? undefined);
        const result = await sendTelegramMessage(token, chatId, text, keyboard);
        if (result.ok && result.message_id) {
          await updateCandidateDecision(candidate.id, "PENDING", {
            telegram_message_id: String(result.message_id),
          });
        }
        alerted.push(candidate.pair);
      }
    }

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
      skipped: skipped.length,
      errors: errors.length,
      duration_ms: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Agent run failed" },
      { status: 500 }
    );
  }
}
