import Shell from "@/components/Shell"

export default function TerminalPage() {
  return (
    <Shell
      title="Terminal"
      subtitle="Private trading center. Signals, charts, and execution."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Watchlist">
          <ListRow left="AUD USD" right="M15" />
          <ListRow left="EUR USD" right="H1" />
          <ListRow left="GBP JPY" right="H4" />
        </Panel>

        <Panel title="Latest Signal">
          <div className="text-sm text-zinc-300">No signal yet.</div>
          <div className="mt-2 text-xs text-zinc-500">
            This will pull from your agent API.
          </div>
        </Panel>

        <Panel title="Risk">
          <ListRow left="Mode" right="Paper" />
          <ListRow left="Max risk" right="0.50%" />
          <ListRow left="Daily cap" right="1.50%" />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Panel title="Chart">
          <div className="h-72 rounded-lg border border-zinc-800 bg-black/40" />
          <div className="mt-2 text-xs text-zinc-500">
            TradingView embed goes here first.
          </div>
        </Panel>

        <Panel title="Journal Quick Log">
          <div className="space-y-3">
            <input
              className="w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/70"
              placeholder="Setup name"
            />
            <textarea
              className="h-28 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/70"
              placeholder="Notes"
            />
            <button className="rounded-lg border border-violet-400/60 bg-violet-600/10 px-4 py-2 text-sm transition hover:bg-violet-600/20">
              Save Draft
            </button>
          </div>
        </Panel>
      </div>
    </Shell>
  )
}

function Panel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="mb-3 text-sm font-semibold text-zinc-100">{title}</div>
      {children}
    </div>
  )
}

function ListRow({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-900 py-2 text-sm">
      <div className="text-zinc-300">{left}</div>
      <div className="text-zinc-500">{right}</div>
    </div>
  )
}