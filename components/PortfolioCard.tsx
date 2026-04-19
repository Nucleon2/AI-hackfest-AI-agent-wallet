"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { MagicCard } from "@/components/ui/magic-card";
import { BorderBeam } from "@/components/ui/border-beam";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { networkLabel } from "@/lib/solanaClient";

export function PortfolioCard() {
  const { connected, publicKey } = useWallet();
  const { balance, loading } = useWalletBalance();

  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <div className="relative rounded-2xl overflow-hidden">
      <MagicCard
        className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-5"
        gradientColor="#6366f120"
        gradientSize={250}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40 mb-1">
              Total Balance
            </p>
            <div
              className={cn(
                "text-4xl font-bold tracking-tight text-white transition-all",
                loading && "opacity-40 animate-pulse"
              )}
            >
              {!connected
                ? "—"
                : balance === null
                  ? "—"
                  : `${balance.toFixed(4)}`}
              <span className="ml-2 text-lg font-normal text-indigo-300">
                SOL
              </span>
            </div>
            {connected && balance !== null && (
              <p className="mt-1 text-sm text-white/30">
                ≈ ${(balance * 175).toFixed(2)} USD
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Badge
              variant="outline"
              className={cn(
                "border-white/10 text-xs font-medium",
                connected
                  ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5"
                  : "text-white/30 bg-white/5"
              )}
            >
              <span
                className={cn(
                  "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                  connected ? "bg-emerald-400" : "bg-white/20"
                )}
              />
              {connected ? networkLabel() : "Not connected"}
            </Badge>

            {shortAddress && (
              <p className="text-[11px] font-mono text-white/25">
                {shortAddress}
              </p>
            )}
          </div>
        </div>

        {connected && (
          <div className="mt-4 flex gap-2">
            <QuickAction label="Send" icon="↗" />
            <QuickAction label="Swap" icon="⇄" />
            <QuickAction label="History" icon="⊙" />
          </div>
        )}
      </MagicCard>
      <BorderBeam
        size={120}
        duration={8}
        colorFrom="#6366f1"
        colorTo="#a78bfa"
        borderWidth={1}
      />
    </div>
  );
}

function QuickAction({ label, icon }: { label: string; icon: string }) {
  return (
    <button className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-white/80">
      <span className="text-indigo-400">{icon}</span>
      {label}
    </button>
  );
}
