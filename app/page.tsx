export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center relative overflow-hidden">

      {/* Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(124,58,237,0.25),transparent_60%)]"></div>

      <div className="relative z-10 text-center px-6">

        <h1 className="text-6xl md:text-7xl font-light tracking-[0.3em]">
          KINOE
        </h1>

        <p className="mt-6 text-lg text-zinc-400 tracking-wide">
          Precision Markets. Private Capital.
        </p>

        <div className="mt-10">
          <button className="px-8 py-3 border border-purple-600 text-purple-400 hover:bg-purple-700 hover:text-white transition-all duration-300">
            View Strategy
          </button>
        </div>

      </div>

    </main>
  )
}