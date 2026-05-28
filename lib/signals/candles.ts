export type OandaCandle = {
  complete: boolean;
  time: string;
  mid: { o: string; h: string; l: string; c: string };
};

export type ParsedCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export function parseCandles(candles: OandaCandle[]): ParsedCandle[] {
  return candles
    .filter((c) => c.complete)
    .map((c) => ({
      time: c.time,
      open: Number(c.mid.o),
      high: Number(c.mid.h),
      low: Number(c.mid.l),
      close: Number(c.mid.c),
    }));
}

export function calculateATR(candles: ParsedCandle[], period = 14): number {
  const recent = candles.slice(-period);
  if (recent.length < 2) return 0;
  const ranges = recent.map((c) => c.high - c.low);
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}
