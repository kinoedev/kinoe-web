"use client";

import { useEffect, useRef, useState } from "react";

const CURVE = "#a855f7";

/** Single-series line with a zero baseline and crosshair tooltip. Sizes to its container. */
export default function LineChart({
  points,
  format,
  height = 220,
  label,
  refLine,
  zeroLine = true,
}: {
  points: { x: string; y: number; sub?: string }[];
  format: (v: number) => string;
  height?: number;
  label: string;
  /** A dashed reference level (e.g. the drawdown floor). */
  refLine?: { y: number; label: string };
  zeroLine?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) return <div ref={wrap} className="py-10 text-center text-xs text-white/40">No trades in this range.</div>;

  const H = height;
  const pad = { l: 56, r: 12, t: 12, b: 22 };
  const vals = [...(zeroLine ? [0] : []), ...(refLine ? [refLine.y] : []), ...points.map((p) => p.y)];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const n = points.length;
  const x = (i: number) => pad.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / span) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const ticks = [hi, (hi + lo) / 2, lo];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const h = hover !== null ? points[hover] : null;
  return (
    <div ref={wrap} className="relative">
      <svg
        width={W}
        height={H}
        className="block touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${label}: ${format(points[n - 1].y)} at ${points[n - 1].x}`}
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
            <text x={pad.l - 8} y={y(v) + 3} textAnchor="end" fontSize="10" className="fill-white/35 font-mono">
              {format(v)}
            </text>
          </g>
        ))}
        {refLine ? (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(refLine.y)} y2={y(refLine.y)} stroke="rgba(248,113,113,0.8)" strokeDasharray="5 4" />
            <text x={W - pad.r} y={y(refLine.y) - 4} textAnchor="end" fontSize="10" className="fill-red-300/80">
              {refLine.label}
            </text>
          </g>
        ) : null}
        {zeroLine && lo < 0 && hi > 0 ? <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.28)" /> : null}
        <text x={pad.l} y={H - 6} fontSize="10" className="fill-white/30">
          {points[0].x}
        </text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="10" className="fill-white/30">
          {points[n - 1].x}
        </text>
        <path d={d} fill="none" stroke={CURVE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {n === 1 ? <circle cx={x(0)} cy={y(points[0].y)} r={4} fill={CURVE} /> : null}
        {hover !== null ? (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(points[hover].y)} r={4} fill={CURVE} stroke="#09090b" strokeWidth={2} />
          </>
        ) : null}
      </svg>
      {h && hover !== null ? (
        <div
          className="pointer-events-none absolute top-1 rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-[11px] shadow-xl"
          style={{ left: Math.min(W - 170, Math.max(0, x(hover) + 10)) }}
        >
          <div className="font-mono text-sm text-white">{format(h.y)}</div>
          <div className="text-white/45">{h.x}</div>
          {h.sub ? <div className="text-white/45">{h.sub}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
