"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { MagicCard } from "@/components/ui/magic-card";
import { BorderBeam } from "@/components/ui/border-beam";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Badge } from "@/components/ui/badge";
import { useStakingStatus, type StakingStatus } from "@/hooks/useStakingStatus";
import { cn } from "@/lib/utils";

interface StakingCardProps {
  onUnstakeRequest?: (provider: "marinade" | "jito") => void;
}

export function StakingCard({ onUnstakeRequest }: StakingCardProps) {
  const { connected } = useWallet();
  const { status, loading, error } = useStakingStatus();

  const hasStaked =
    (status?.msolBalance ?? 0) > 0 || (status?.jitoBalance ?? 0) > 0;

  return (
    <div className="relative rounded-2xl overflow-hidden">
      <MagicCard
        className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-5"
        gradientColor="#10b98120"
        gradientSize={260}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40 mb-1">
              Liquid Staking
            </p>
            <p className="text-sm text-white/60">
              Earn yield without locking your SOL
            </p>
          </div>

          <Badge
            variant="outline"
            className={cn(
              "border-white/10 text-xs font-medium",
              hasStaked
                ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5"
                : "text-white/30 bg-white/5"
            )}
          >
            <span
              className={cn(
                "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                hasStaked ? "bg-emerald-400 animate-pulse" : "bg-white/20"
              )}
            />
            {hasStaked ? "Earning" : "Idle"}
          </Badge>
        </div>

        {!connected ? (
          <div className="mt-5 rounded-xl border border-white/8 bg-white/5 p-4 text-sm text-white/50">
            Connect your wallet to view liquid staking positions.
          </div>
        ) : error ? (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : !status && loading ? (
          <div className="mt-5 space-y-2">
            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
          </div>
        ) : !hasStaked ? (
          <EmptyState />
        ) : (
          <div className="mt-5 space-y-3">
            {status!.msolBalance > 0 && (
              <StakingRow
                provider="marinade"
                symbol="mSOL"
                balance={status!.msolBalance}
                apy={status!.apy}
                dailyYieldSol={status!.estimatedDailyYieldSol}
                monthlyYieldSol={status!.estimatedMonthlyYieldSol}
                onUnstake={() => onUnstakeRequest?.("marinade")}
              />
            )}
            {status!.jitoBalance > 0 && (
              <StakingRow
                provider="jito"
                symbol="JitoSOL"
                balance={status!.jitoBalance}
                apy={status!.jitoApy}
                dailyYieldSol={
                  (status!.jitoBalance * status!.jitoApy) / 365
                }
                monthlyYieldSol={
                  (status!.jitoBalance * status!.jitoApy * 30) / 365
                }
                onUnstake={() => onUnstakeRequest?.("jito")}
              />
            )}
          </div>
        )}
      </MagicCard>
      <BorderBeam
        size={120}
        duration={8}
        colorFrom="#10b981"
        colorTo="#6366f1"
        borderWidth={1}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-5 rounded-xl border border-white/8 bg-white/5 p-5 text-center">
      <p className="text-sm text-white/70">No staked SOL yet.</p>
      <p className="mt-1 text-xs text-white/40">
        Try: <span className="font-mono text-indigo-300">&quot;stake 5 SOL&quot;</span>
      </p>
    </div>
  );
}

interface StakingRowProps {
  provider: "marinade" | "jito";
  symbol: string;
  balance: number;
  apy: number;
  dailyYieldSol: number;
  monthlyYieldSol: number;
  onUnstake: () => void;
}

function StakingRow({
  provider,
  symbol,
  balance,
  apy,
  dailyYieldSol,
  monthlyYieldSol,
  onUnstake,
}: StakingRowProps) {
  const providerName = provider === "jito" ? "Jito" : "Marinade";
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-white/40">
              {providerName}
            </span>
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
              {(apy * 100).toFixed(2)}% APY
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <NumberTicker
              value={parseFloat(balance.toFixed(4))}
              decimalPlaces={4}
              className="text-2xl font-semibold text-white"
            />
            <span className="text-sm text-white/60">{symbol}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onUnstake}
          className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
        >
          Unstake
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <YieldTile label="Est. daily" value={`+${dailyYieldSol.toFixed(5)} SOL`} />
        <YieldTile label="Est. monthly" value={`+${monthlyYieldSol.toFixed(4)} SOL`} />
      </div>
    </div>
  );
}

function YieldTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </p>
      <p className="mt-0.5 text-xs font-medium text-emerald-300/90">{value}</p>
    </div>
  );
}

export function formatStakingStatus(status: StakingStatus | null): string {
  if (!status) return "No staking data yet.";
  if (status.msolBalance <= 0 && status.jitoBalance <= 0) {
    return "You don't have any liquid staking positions yet.";
  }
  const parts: string[] = [];
  if (status.msolBalance > 0) {
    parts.push(
      `${status.msolBalance.toFixed(4)} mSOL at ${(status.apy * 100).toFixed(2)}% APY`
    );
  }
  if (status.jitoBalance > 0) {
    parts.push(
      `${status.jitoBalance.toFixed(4)} JitoSOL at ${(status.jitoApy * 100).toFixed(2)}% APY`
    );
  }
  return `You're earning on ${parts.join(" and ")}.`;
}
