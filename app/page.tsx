"use client";

import { WalletConnectButton } from "@/components/WalletConnectButton";
import { ChatInterface } from "@/components/ChatInterface";
import { Sidebar } from "@/components/Sidebar";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { networkLabel } from "@/lib/solanaClient";

export default function Home() {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#05060d]">
      {/* Background layer */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {/* Radial glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.2) 0%, transparent 65%)",
          }}
        />
        {/* Secondary glow bottom-right */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 50% 40% at 85% 90%, rgba(167,139,250,0.08) 0%, transparent 60%)",
          }}
        />
        <AnimatedGridPattern
          width={50}
          height={50}
          numSquares={30}
          maxOpacity={0.04}
          duration={6}
          className="fill-indigo-400/10 stroke-indigo-400/10"
        />
      </div>

      {/* App shell */}
      <div className="relative z-10 flex h-full flex-col">
        {/* Header */}
        <header className="relative z-20 flex flex-shrink-0 items-center justify-between border-b border-white/[0.06] bg-black/30 px-6 py-3.5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="relative flex h-8 w-8 items-center justify-center">
              <div className="absolute inset-0 rounded-lg bg-indigo-500/20 blur-sm" />
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L20.5 7V17L12 22L3.5 17V7L12 2Z"
                    stroke="#818cf8"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12" r="2" fill="#818cf8" />
                </svg>
              </div>
            </div>
            <AnimatedShinyText
              shimmerWidth={120}
              className="text-sm font-semibold text-white/80"
            >
              Solace
            </AnimatedShinyText>
          </div>

          {/* Center — network pill */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-medium text-white/40 tracking-wider uppercase">
              {`Solana ${networkLabel()}`}
            </span>
          </div>

          <div className="relative z-50">
            <WalletConnectButton />
          </div>
        </header>

        {/* Body: sidebar + chat */}
        <div className="flex flex-1 min-h-0">
          <Sidebar />

          {/* Main chat panel */}
          <main className="relative flex flex-1 flex-col min-w-0 min-h-0">
            {/* Panel border glow */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent" />
            <ChatInterface />
          </main>
        </div>
      </div>
    </div>
  );
}
