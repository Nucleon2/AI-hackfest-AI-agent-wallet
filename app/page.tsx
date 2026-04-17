"use client";

import dynamic from "next/dynamic";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { PortfolioCard } from "@/components/PortfolioCard";
import { ChatInterface } from "@/components/ChatInterface";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { ShineBorder } from "@/components/ui/shine-border";
import { TransactionStatusProvider } from "@/components/TransactionStatusProvider";

const Scene = dynamic(
  () => import("@/components/three/Scene").then((m) => m.Scene),
  { ssr: false }
);

export default function Home() {
  return (
    <TransactionStatusProvider>
      <Scene />

      <main className="relative z-10 flex h-screen flex-col overflow-hidden">
        {/* Header */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-white/8 bg-black/20 px-6 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 border border-indigo-500/30">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#818cf8" strokeWidth="1.5" />
                <path d="M9 12l2 2 4-4" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <AnimatedShinyText
              shimmerWidth={120}
              className="text-sm font-semibold text-white/80"
            >
              AI Agent Wallet
            </AnimatedShinyText>
          </div>
          <WalletConnectButton />
        </header>

        {/* Content */}
        <div className="flex flex-1 min-h-0 items-stretch justify-center px-4 py-4">
          <div className="flex w-full max-w-2xl flex-col gap-4">
            {/* Portfolio card */}
            <div className="flex-shrink-0">
              <PortfolioCard />
            </div>

            {/* Chat panel */}
            <div className="relative flex flex-1 min-h-0 flex-col rounded-2xl border border-white/8 bg-black/30 backdrop-blur-xl p-4 overflow-hidden">
              <ShineBorder
                shineColor={["#6366f1", "#a78bfa", "#38bdf8"]}
                borderWidth={1}
                duration={10}
              />
              <ChatInterface />
            </div>
          </div>
        </div>
      </main>
    </TransactionStatusProvider>
  );
}
