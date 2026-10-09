import type { Bar } from "@/lib/futures/types";

export type VolumeProfile = {
  bucketSize: number;
  /** Price at the bottom of bucket 0. */
  base: number;
  volumes: number[];
  poc: number;
  vah: number;
  val: number;
  pocVolume: number;
  /** Low-volume nodes: prices where volume dries up between two heavier areas. */
  lvns: number[];
};

function bucketMid(p: VolumeProfile | { base: number; bucketSize: number }, i: number) {
  return p.base + (i + 0.5) * p.bucketSize;
}

/**
 * Build a volume-at-price profile from OHLCV bars. Each bar's volume is spread
 * evenly across the buckets its high–low range covers — the standard approach
 * when tick data isn't available. Use 1-minute bars for a sharp profile.
 */
export function buildProfile(bars: Bar[], tick: number, targetBuckets = 300, valueAreaPct = 0.7): VolumeProfile | null {
  const valid = bars.filter((b) => b.volume > 0 && b.high >= b.low);
  if (valid.length === 0) return null;

  const lo = Math.min(...valid.map((b) => b.low));
  const hi = Math.max(...valid.map((b) => b.high));
  const ticksInRange = Math.max(1, Math.round((hi - lo) / tick));
  const bucketSize = tick * Math.max(1, Math.ceil(ticksInRange / targetBuckets));
  const base = Math.floor(lo / bucketSize) * bucketSize;
  const n = Math.max(1, Math.floor((hi - base) / bucketSize) + 1);
  const volumes = new Array<number>(n).fill(0);

  for (const b of valid) {
    const from = Math.min(n - 1, Math.max(0, Math.floor((b.low - base) / bucketSize)));
    const to = Math.min(n - 1, Math.max(0, Math.floor((b.high - base) / bucketSize)));
    const share = b.volume / (to - from + 1);
    for (let i = from; i <= to; i++) volumes[i] += share;
  }

  // Point of control
  let pocIdx = 0;
  for (let i = 1; i < n; i++) if (volumes[i] > volumes[pocIdx]) pocIdx = i;

  // Value area: grow outward from the POC, always taking the heavier neighbour.
  const total = volumes.reduce((s, v) => s + v, 0);
  let lowIdx = pocIdx;
  let highIdx = pocIdx;
  let inArea = volumes[pocIdx];
  while (inArea < total * valueAreaPct && (lowIdx > 0 || highIdx < n - 1)) {
    const up = highIdx < n - 1 ? volumes[highIdx + 1] : -1;
    const down = lowIdx > 0 ? volumes[lowIdx - 1] : -1;
    if (up >= down) inArea += volumes[++highIdx];
    else inArea += volumes[--lowIdx];
  }

  const geom = { base, bucketSize };
  const profile: VolumeProfile = {
    bucketSize,
    base,
    volumes,
    poc: bucketMid(geom, pocIdx),
    vah: base + (highIdx + 1) * bucketSize,
    val: base + lowIdx * bucketSize,
    pocVolume: volumes[pocIdx],
    lvns: [],
  };
  profile.lvns = findLowVolumeNodes(profile);
  return profile;
}

function smooth(values: number[], radius: number): number[] {
  return values.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = i - radius; j <= i + radius; j++) {
      if (j >= 0 && j < values.length) {
        s += values[j];
        c++;
      }
    }
    return s / c;
  });
}

/** Valleys in the smoothed profile that sit well below the heavier nodes on both sides. */
function findLowVolumeNodes(p: VolumeProfile, maxNodes = 3): number[] {
  const radius = Math.max(2, Math.round(p.volumes.length / 60));
  const sm = smooth(p.volumes, radius);
  const peak = Math.max(...sm);
  const candidates: { idx: number; depth: number }[] = [];

  for (let i = radius; i < sm.length - radius; i++) {
    let isMin = true;
    for (let j = i - radius; j <= i + radius; j++) if (sm[j] < sm[i]) isMin = false;
    if (!isMin || sm[i] > peak * 0.35) continue;

    const leftPeak = Math.max(...sm.slice(0, i));
    const rightPeak = Math.max(...sm.slice(i + 1));
    const shoulder = Math.min(leftPeak, rightPeak);
    if (shoulder < sm[i] * 2 || shoulder < peak * 0.25) continue;
    candidates.push({ idx: i, depth: shoulder - sm[i] });
  }

  // Keep the deepest valleys, at least a few buckets apart.
  const picked: number[] = [];
  for (const c of candidates.sort((a, b) => b.depth - a.depth)) {
    if (picked.every((i) => Math.abs(i - c.idx) > radius * 3)) picked.push(c.idx);
    if (picked.length >= maxNodes) break;
  }
  return picked.map((i) => bucketMid(p, i)).sort((a, b) => a - b);
}

/** True when the price sits in a thin part of the profile. */
export function isLowVolumeAt(p: VolumeProfile, price: number, threshold = 0.35): boolean {
  const i = Math.floor((price - p.base) / p.bucketSize);
  if (i < 0 || i >= p.volumes.length) return false;
  const radius = Math.max(1, Math.round(p.volumes.length / 100));
  let s = 0;
  let c = 0;
  for (let j = i - radius; j <= i + radius; j++) {
    if (j >= 0 && j < p.volumes.length) {
      s += p.volumes[j];
      c++;
    }
  }
  return s / c < p.pocVolume * threshold;
}
