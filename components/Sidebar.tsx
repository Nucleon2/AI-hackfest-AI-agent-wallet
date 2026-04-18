"use client";

import { useEffect, useState } from "react";
import type { PortfolioConfig } from "@/types/intent";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { useStakingStatus } from "@/hooks/useStakingStatus";
import { useChatSessionStore } from "@/lib/stores/chatSessionStore";
import { useChatSessions } from "@/hooks/useChatSessions";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Ripple } from "@/components/ui/ripple";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export function Sidebar() {
  const { connected, publicKey } = useWallet();
  const { balance, loading } = useWalletBalance();
  const [copied, setCopied] = useState(false);

  const { sessions, activeSessionId, setActiveSessionId } = useChatSessionStore();
  const { createSession, deleteSession } = useChatSessions(publicKey?.toBase58() ?? null);
  const [portfolioConfig, setPortfolioConfig] = useState<PortfolioConfig | null>(null);
  const { status: stakingStatus } = useStakingStatus();

  useEffect(() => {
    if (!publicKey) { setPortfolioConfig(null); return; }
    fetch(`/api/portfolio/config?wallet=${publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((json: { success: boolean; data?: PortfolioConfig | null }) => {
        if (json.success) setPortfolioConfig(json.data ?? null);
      })
      .catch(() => {});
  }, [publicKey]);

  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 6)}...${publicKey.toBase58().slice(-4)}`
    : null;

  function copyAddress() {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <aside className="relative flex w-72 flex-shrink-0 flex-col border-r border-white/[0.06] bg-black/20 backdrop-blur-xl">
      {/* Balance panel */}
      <div className="relative overflow-hidden border-b border-white/[0.06] px-6 py-8">
        <Ripple
          mainCircleSize={180}
          mainCircleOpacity={0.08}
          numCircles={5}
          className="opacity-60"
        />
        <div className="relative z-10">
          <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-white/35">
            Total Balance
          </p>
          <div className={cn("flex items-baseline gap-2", loading && "opacity-50")}>
            {connected && balance !== null ? (
              <NumberTicker
                value={parseFloat(balance.toFixed(4))}
                decimalPlaces={4}
                className="text-4xl font-bold text-white"
              />
            ) : (
              <span className="text-4xl font-bold text-white/30">
                {connected ? "—" : "—"}
              </span>
            )}
            <span className="text-base font-medium text-indigo-400">SOL</span>
          </div>
          {connected && balance !== null && (
            <p className="mt-1 text-xs text-white/30">
              ≈ ${(balance * 175).toFixed(2)} USD
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium border",
                connected
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-white/10 bg-white/5 text-white/30"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  connected ? "bg-emerald-400 animate-pulse" : "bg-white/20"
                )}
              />
              {connected ? "Devnet" : "Not connected"}
            </span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="border-b border-white/[0.06] px-4 py-4">
        <p className="mb-3 px-2 text-[10px] uppercase tracking-[0.15em] text-white/25">
          Quick Actions
        </p>
        <div className="flex flex-col gap-1.5">
          <QuickAction icon={<SendIcon />} label="Send" description="Transfer tokens" />
          <QuickAction icon={<SwapIcon />} label="Swap" description="Exchange tokens" />
          <QuickAction icon={<HistoryIcon />} label="History" description="Recent activity" />
          <QuickAction icon={<ScheduleIcon />} label="Scheduled" description="Recurring payments" />
        </div>
      </div>

      {/* Portfolio status */}
      {connected && portfolioConfig && (
        <div className="border-b border-white/[0.06] px-4 py-4">
          <p className="mb-3 px-2 text-[10px] uppercase tracking-[0.15em] text-white/25">Portfolio</p>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Auto-Rebalance</span>
              <span className={cn(
                "flex items-center gap-1 text-[10px] font-medium",
                portfolioConfig.is_active ? "text-emerald-400" : "text-white/30"
              )}>
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  portfolioConfig.is_active ? "bg-emerald-400 animate-pulse" : "bg-white/20"
                )} />
                {portfolioConfig.is_active ? "Active" : "Paused"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {portfolioConfig.targets.map((t) => (
                <span key={t.token} className="rounded px-1.5 py-0.5 text-[9px] font-mono border border-white/[0.06] bg-white/[0.02] text-white/40">
                  {t.token} {t.percentage}%
                </span>
              ))}
            </div>
            {portfolioConfig.last_rebalanced_at && (
              <p className="mt-1.5 text-[10px] text-white/20">
                Last rebalanced {relativeTime(portfolioConfig.last_rebalanced_at)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Staking */}
      {connected && stakingStatus &&
        (stakingStatus.msolBalance > 0 || stakingStatus.jitoBalance > 0) && (
        <div className="border-b border-white/[0.06] px-4 py-4">
          <p className="mb-3 px-2 text-[10px] uppercase tracking-[0.15em] text-white/25">Staking</p>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
            {stakingStatus.msolBalance > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">
                  {stakingStatus.msolBalance.toFixed(4)} mSOL
                </span>
                <span className="text-[10px] font-medium text-emerald-400">
                  {(stakingStatus.apy * 100).toFixed(2)}% APY
                </span>
              </div>
            )}
            {stakingStatus.jitoBalance > 0 && (
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs text-white/60">
                  {stakingStatus.jitoBalance.toFixed(4)} JitoSOL
                </span>
                <span className="text-[10px] font-medium text-emerald-400">
                  {(stakingStatus.jitoApy * 100).toFixed(2)}% APY
                </span>
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-white/30">
              +{stakingStatus.estimatedMonthlyYieldSol.toFixed(4)} SOL / month
            </p>
          </div>
        </div>
      )}

      {/* Chat Sessions */}
      {connected && (
        <div className="border-b border-white/[0.06] px-4 py-4">
          <div className="mb-3 flex items-center justify-between px-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/25">
              Chats
            </p>
            <button
              onClick={() => createSession()}
              className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-white/40 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-400"
            >
              <span className="text-sm leading-none">+</span>
              New
            </button>
          </div>
          <div className="flex max-h-[220px] flex-col gap-1 overflow-y-auto pr-1">
            {sessions.length === 0 && (
              <p className="px-2 text-[10px] text-white/20">No chats yet</p>
            )}
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "group relative flex cursor-pointer items-start justify-between rounded-xl border px-3 py-2.5 transition-all",
                  session.id === activeSessionId
                    ? "border-indigo-500/30 bg-indigo-500/10"
                    : "border-white/[0.06] bg-white/[0.03] hover:border-indigo-500/20 hover:bg-indigo-500/5"
                )}
                onClick={() => setActiveSessionId(session.id)}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-xs font-medium",
                      session.id === activeSessionId ? "text-white/90" : "text-white/60"
                    )}
                  >
                    {session.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/25">
                    {relativeTime(session.updated_at)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(session.id);
                  }}
                  className="ml-1.5 mt-0.5 flex-shrink-0 rounded p-0.5 text-white/20 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                  aria-label="Delete session"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wallet address */}
      {connected && shortAddress && (
        <div className="px-4 py-4">
          <p className="mb-2 px-2 text-[10px] uppercase tracking-[0.15em] text-white/25">
            Wallet
          </p>
          <button
            onClick={copyAddress}
            className="group flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all hover:border-indigo-500/20 hover:bg-indigo-500/5"
          >
            <span className="font-mono text-xs text-white/40 group-hover:text-white/60">
              {shortAddress}
            </span>
            <span className="text-[10px] text-white/25 group-hover:text-indigo-400 transition-colors">
              {copied ? "Copied!" : "Copy"}
            </span>
          </button>
        </div>
      )}

      {/* Bottom branding */}
      <div className="mt-auto px-6 py-5">
        <div className="flex items-center gap-2 opacity-30">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L20.5 7V17L12 22L3.5 17V7L12 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] text-white tracking-wider">AI Agent Wallet</span>
        </div>
        <p className="mt-1 text-[9px] text-white/20">Powered by Claude · Solana Devnet</p>
      </div>

      <BorderBeam
        size={150}
        duration={10}
        colorFrom="#6366f1"
        colorTo="#a78bfa"
        borderWidth={1}
        className="opacity-50"
      />
    </aside>
  );
}

function QuickAction({
  icon,
  label,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <button className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all hover:border-indigo-500/15 hover:bg-indigo-500/5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/50 transition-colors group-hover:border-indigo-500/30 group-hover:bg-indigo-500/10 group-hover:text-indigo-400">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-white/70 transition-colors group-hover:text-white/90">
          {label}
        </p>
        <p className="text-[10px] text-white/25">{description}</p>
      </div>
    </button>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4M7 4L4 7M7 4L10 7" />
      <path d="M17 8V20M17 20L14 17M17 20L20 17" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8v4l3 3" />
      <path d="M3.05 11a9 9 0 1 0 .5-4" />
      <path d="M3 4v4h4" />
    </svg>
  );
}

function ScheduleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  );
}
