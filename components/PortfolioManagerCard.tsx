"use client";

import { motion, AnimatePresence } from "motion/react";
import { MagicCard } from "@/components/ui/magic-card";
import { BorderBeam } from "@/components/ui/border-beam";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { cn } from "@/lib/utils";
import type { PortfolioConfig, PortfolioStatus, RebalanceSwap } from "@/types/intent";

function relativeTime(ts: number | null): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface PortfolioManagerCardProps {
  config: PortfolioConfig | null;
  status: PortfolioStatus | null;
  isRebalancing?: boolean;
  pendingSwaps?: RebalanceSwap[] | null;
  rebalanceReasoning?: string | null;
  error?: string | null;
  onTriggerRebalance?: () => void;
  onConfirmSwaps?: () => void;
  onDismissSwaps?: () => void;
  onToggleAutoExecute?: (value: boolean) => void;
  onToggleActive?: (value: boolean) => void;
}

export function PortfolioManagerCard({
  config,
  status,
  isRebalancing = false,
  pendingSwaps,
  rebalanceReasoning,
  error,
  onTriggerRebalance,
  onConfirmSwaps,
  onDismissSwaps,
  onToggleAutoExecute,
  onToggleActive,
}: PortfolioManagerCardProps) {
  if (!config) {
    return (
      <div className="relative rounded-2xl overflow-hidden" data-testid="portfolio-manager-card">
        <MagicCard
          className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-5"
          gradientColor="#6366f120"
          gradientSize={250}
        >
          <p className="text-sm text-white/40">No portfolio target set. Try: &quot;keep my portfolio 60% SOL, 40% USDC&quot;</p>
        </MagicCard>
      </div>
    );
  }

  const allocations = status?.allocations ?? config.targets.map((t) => ({
    token: t.token,
    currentPct: 0,
    targetPct: t.percentage,
    drift: -t.percentage,
    valueUsd: 0,
    balanceUi: 0,
    priceUsd: 0,
  }));

  const isLoading = !status && config;

  return (
    <div className="relative rounded-2xl overflow-hidden" data-testid="portfolio-manager-card">
      <MagicCard
        className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-5 space-y-4"
        gradientColor="#4f46e520"
        gradientSize={300}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M3 3v18h18" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M7 16l4-4 4 4 5-5" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white/90">Portfolio Manager</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/40">Auto-execute</span>
              <Switch
                checked={config.auto_execute}
                onCheckedChange={onToggleAutoExecute}
                className="scale-75 data-[state=checked]:bg-indigo-500"
              />
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] border px-2 py-0.5",
                config.is_active
                  ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/5"
                  : "text-white/30 border-white/10 bg-white/5"
              )}
            >
              <span
                className={cn(
                  "mr-1.5 h-1.5 w-1.5 rounded-full inline-block",
                  config.is_active ? "bg-emerald-400 animate-pulse" : "bg-white/20"
                )}
              />
              {config.is_active ? "Active" : "Paused"}
            </Badge>
            <Switch
              checked={config.is_active}
              onCheckedChange={onToggleActive}
              className="scale-75 data-[state=checked]:bg-emerald-500"
            />
          </div>
        </div>

        {/* Allocation bars */}
        <div className="space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-white/30">
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Loading portfolio data…
            </div>
          )}
          {allocations.map((alloc) => {
            const overThreshold = Math.abs(alloc.drift) >= config.drift_threshold;
            const over = alloc.drift > 0;
            return (
              <div key={alloc.token} data-testid="allocation-bar">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white/80">{alloc.token}</span>
                    <span className={cn(
                      "text-[10px] font-mono px-1.5 py-0.5 rounded",
                      overThreshold
                        ? over
                          ? "bg-red-500/15 text-red-400"
                          : "bg-amber-500/15 text-amber-400"
                        : "bg-emerald-500/10 text-emerald-400"
                    )}>
                      {alloc.drift > 0 ? "+" : ""}{alloc.drift.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-white/40">
                    <span className="font-mono">{alloc.currentPct.toFixed(1)}%</span>
                    <span className="text-white/20">/ target {alloc.targetPct}%</span>
                  </div>
                </div>
                <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  {/* Target marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/20 z-10"
                    style={{ left: `${alloc.targetPct}%` }}
                  />
                  {/* Current allocation bar */}
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      overThreshold
                        ? over ? "bg-red-500" : "bg-amber-500"
                        : "bg-indigo-500"
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(alloc.currentPct, 100)}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                {alloc.valueUsd > 0 && (
                  <p className="mt-1 text-[10px] text-white/25">
                    {alloc.balanceUi.toFixed(4)} {alloc.token} · ${alloc.valueUsd.toFixed(2)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <div className="space-y-0.5">
            {status && (
              <p className="text-xs text-white/50">
                Total: <span className="text-white/80 font-mono">${status.totalValueUsd.toFixed(2)}</span>
              </p>
            )}
            <p className="text-[10px] text-white/25">
              Last rebalanced: {relativeTime(config.last_rebalanced_at)}
            </p>
            <p className="text-[10px] text-white/20">
              Threshold: {config.drift_threshold}% drift
            </p>
          </div>
          <ShimmerButton
            onClick={onTriggerRebalance}
            disabled={isRebalancing || !config.is_active}
            shimmerColor="#a5b4fc"
            background="rgba(99, 102, 241, 0.15)"
            borderRadius="10px"
            className="h-8 px-3 text-xs border-indigo-500/20 disabled:opacity-30"
          >
            {isRebalancing ? (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
                Analyzing…
              </span>
            ) : (
              "Rebalance Now"
            )}
          </ShimmerButton>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Pending swaps preview */}
        <AnimatePresence>
          {pendingSwaps && pendingSwaps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <p className="text-xs font-semibold text-indigo-300">
                  Claude recommends {pendingSwaps.length} swap{pendingSwaps.length > 1 ? "s" : ""}
                </p>
              </div>
              {rebalanceReasoning && (
                <p className="text-[10px] text-white/40 leading-relaxed">{rebalanceReasoning}</p>
              )}
              <div className="space-y-1.5">
                {pendingSwaps.map((swap, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2"
                  >
                    <span className="text-xs text-white/70">
                      Sell <span className="font-semibold text-white/90">{swap.fromAmount.toFixed(4)} {swap.fromToken}</span>
                      {" → "}
                      <span className="font-semibold text-indigo-300">{swap.toToken}</span>
                    </span>
                    <span className="text-[10px] text-white/30">{swap.reason}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <ShimmerButton
                  onClick={onConfirmSwaps}
                  shimmerColor="#a5b4fc"
                  background="rgba(99, 102, 241, 0.25)"
                  borderRadius="8px"
                  className="flex-1 h-8 text-xs border-indigo-500/30"
                >
                  Confirm Swaps
                </ShimmerButton>
                <button
                  onClick={onDismissSwaps}
                  className="flex-1 h-8 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </MagicCard>
      <BorderBeam
        size={150}
        duration={10}
        colorFrom="#6366f1"
        colorTo="#8b5cf6"
        borderWidth={1}
      />
    </div>
  );
}
