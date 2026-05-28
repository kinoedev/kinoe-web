import { parseCandles } from "@/lib/signals/candles";
import { runFullPairAnalysis } from "@/lib/signals/detection";
import type { PairAnalysisResult } from "@/lib/signals/detection";
import { checkPairVolatility, checkPairNewsBlackout } from "@/lib/risk/engine";

type ScannerConfig = {
  pairs: string[];
  oandaApiKey: string;
  oandaBaseUrl: string;
  volatilityGateEnabled: boolean;
  maxAdrMultiplier: number;
  newsBlackoutEnabled: boolean;
  newsBlackoutMinutes: number;
};

async function fetchPairCandles(pair: string, apiKey: string, baseUrl: string, includeM15 = false) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
  const fetches: Promise<Response>[] = [
    fetch(`${baseUrl}/v3/instruments/${pair}/candles?granularity=H4&count=100&price=M`, { headers, cache: "no-store" }),
    fetch(`${baseUrl}/v3/instruments/${pair}/candles?granularity=D&count=50&price=M`, { headers, cache: "no-store" }),
  ];
  if (includeM15) {
    fetches.push(fetch(`${baseUrl}/v3/instruments/${pair}/candles?granularity=M15&count=80&price=M`, { headers, cache: "no-store" }));
  }

  const responses = await Promise.all(fetches);
  if (!responses[0].ok || !responses[1].ok) {
    throw new Error(`OANDA fetch failed for ${pair}: H4=${responses[0].status} D1=${responses[1].status}`);
  }

  const [h4Data, d1Data] = await Promise.all([responses[0].json(), responses[1].json()]);
  const m15Data = includeM15 && responses[2]?.ok ? await responses[2].json() : null;

  return {
    h4Candles: parseCandles(h4Data.candles ?? []),
    d1Candles: parseCandles(d1Data.candles ?? []),
    m15Candles: m15Data ? parseCandles(m15Data.candles ?? []) : undefined,
  };
}

export type ScanResult = {
  analyses: PairAnalysisResult[];
  skipped: { pair: string; reason: string }[];
  errors: { pair: string; error: string }[];
};

export async function scanPairs(config: ScannerConfig): Promise<ScanResult> {
  const utcHour = new Date().getUTCHours();
  const results = await Promise.allSettled(
    config.pairs.map(async (pair) => {
      const { h4Candles, d1Candles } = await fetchPairCandles(pair, config.oandaApiKey, config.oandaBaseUrl);

      if (config.volatilityGateEnabled) {
        const volCheck = checkPairVolatility(pair, d1Candles, config.maxAdrMultiplier);
        if (!volCheck.pass) {
          return { pair, skipped: true as const, reason: volCheck.reason ?? "Volatility gate" };
        }
      }

      if (config.newsBlackoutEnabled) {
        const newsCheck = await checkPairNewsBlackout(pair, config.newsBlackoutMinutes);
        if (!newsCheck.pass) {
          return { pair, skipped: true as const, reason: newsCheck.reason ?? "News blackout" };
        }
      }

      // First pass without M15 to check trade status
      const prelimAnalysis = runFullPairAnalysis(pair, h4Candles, d1Candles, utcHour);

      // Fetch M15 for TRADE_READY setups only — adds precision entry opportunity
      let analysis = prelimAnalysis;
      if (prelimAnalysis.tradeStatus === "TRADE_READY" && prelimAnalysis.setupDetected) {
        try {
          const { m15Candles } = await fetchPairCandles(pair, config.oandaApiKey, config.oandaBaseUrl, true);
          if (m15Candles) {
            analysis = runFullPairAnalysis(pair, h4Candles, d1Candles, utcHour, m15Candles);
          }
        } catch {
          // M15 fetch failure doesn't cancel a valid H4 setup
        }
      }

      return { pair, skipped: false as const, analysis };
    })
  );

  const analyses: PairAnalysisResult[] = [];
  const skipped: { pair: string; reason: string }[] = [];
  const errors: { pair: string; error: string }[] = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      const val = result.value;
      if (val.skipped) {
        skipped.push({ pair: val.pair, reason: val.reason });
      } else {
        analyses.push(val.analysis);
      }
    } else {
      errors.push({
        pair: config.pairs[i],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  return { analyses, skipped, errors };
}
