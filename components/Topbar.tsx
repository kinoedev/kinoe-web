type TopbarProps = {
  agentOnline?: boolean;
};

export default function Topbar({ agentOnline }: TopbarProps = {}) {
  return (
    <header className="flex items-center justify-between border-b border-white/10 bg-black/30 px-6 py-4 backdrop-blur-xl">
      <div>
        <div className="text-sm text-white/80">Terminal</div>
        <div className="text-xs text-white/40">Market Intelligence Desk</div>
      </div>

      <div className="flex items-center gap-3">
        {agentOnline !== undefined ? (
          <div
            className={`rounded-full border px-3 py-1 text-xs ${
              agentOnline
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            {agentOnline ? "Agent online" : "Agent offline"}
          </div>
        ) : null}
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          ENV: local
        </div>
        <button className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-200 hover:bg-purple-500/15">
          Connect Agent
        </button>
      </div>
    </header>
  );
}