import Shell from "@/components/Shell"

export default function ChartsPage() {
  return (
    <Shell title="Charts" subtitle="Your instruments, your timeframes, your view.">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          <div className="space-y-3">
            <select className="w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm text-zinc-200">
              <option>AUD USD</option>
              <option>EUR USD</option>
              <option>GBP JPY</option>
            </select>

            <select className="w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm text-zinc-200">
              <option>M15</option>
              <option>H1</option>
              <option>H4</option>
              <option>D</option>
            </select>

            <button className="w-full rounded-lg border border-violet-400/60 bg-violet-600/10 px-4 py-2 text-sm transition hover:bg-violet-600/20">
              Load Chart
            </button>

            <div className="text-xs text-zinc-500">
              Next step: embed TradingView or render candles from OANDA.
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="h-[520px] rounded-xl border border-zinc-800 bg-black/40" />
        </div>
      </div>
    </Shell>
  )
}