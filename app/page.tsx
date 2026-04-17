"use client";

import dynamic from "next/dynamic";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { useWallet } from "@solana/wallet-adapter-react";

const Scene = dynamic(
  () => import("@/components/three/Scene").then((m) => m.Scene),
  { ssr: false }
);

function BalanceCard() {
  const { connected } = useWallet();
  const { balance, loading } = useWalletBalance();

  if (!connected) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur px-6 py-5 text-sm text-white/70">
        Connect a wallet to see your balance.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur px-6 py-5 text-white">
      <div className="text-xs uppercase tracking-wider text-white/50">
        SOL Balance
      </div>
      <div className="mt-1 text-3xl font-semibold">
        {loading && balance === null
          ? "—"
          : balance === null
            ? "—"
            : `${balance.toFixed(4)} SOL`}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Scene />
      <main className="relative z-10 min-h-screen w-full">
        <header className="flex items-center justify-between px-6 py-4">
          <div className="text-sm font-semibold tracking-wide text-white/80">
            AI Agent Wallet
          </div>
          <WalletConnectButton />
        </header>
        <section className="mx-auto flex min-h-[calc(100vh-72px)] max-w-xl items-center justify-center px-6">
          <BalanceCard />
        </section>
      </main>
    </>
  );
}
