function SignalCard(props: { title: string; body: string; tag: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/80">{props.title}</div>
        <div className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-200">
          {props.tag}
        </div>
      </div>
      <div className="mt-2 text-xs leading-5 text-white/50">{props.body}</div>
    </div>
  );
}

export default function SignalPanel() {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
      <div className="text-sm text-white/80">Signals</div>
      <div className="mt-1 text-xs text-white/40">Agent output (placeholder)</div>

      <div className="mt-5 space-y-3">
        <SignalCard
          title="Bias"
          tag="4H"
          body="No bias loaded yet. We will pull your bias candles and trend candles next."
        />
        <SignalCard
          title="Setup"
          tag="Kangaroo Tail"
          body="Waiting for candle close. This will populate when the detector runs."
        />
        <SignalCard
          title="Risk"
          tag="RR"
          body="We will compute stop, entry, target, and position size once OANDA is connected."
        />
      </div>
    </section>
  );
}