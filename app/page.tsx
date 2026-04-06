import Link from "next/link";
export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center relative overflow-hidden">
      
      {/* Purple glow background */}
      <div className="absolute inset-0">
        <div className="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-purple-700 rounded-full blur-[180px] opacity-30" />
        <div className="absolute bottom-[-200px] right-[-200px] w-[600px] h-[600px] bg-violet-500 rounded-full blur-[180px] opacity-20" />
      </div>

      <div className="relative text-center">
        <h1 className="text-6xl tracking-[0.6em] font-light">
          K I N O E
        </h1>

        <p className="mt-6 text-zinc-400 text-sm tracking-wide">
          Trade with Intention
        </p>

        <Link
  href="/terminal"
  className="mt-8 inline-block px-6 py-3 border border-purple-500 text-purple-400 hover:bg-purple-600/10 transition-all rounded-md"
>
  Enter Terminal
</Link>
      </div>
    </div>
  );
}