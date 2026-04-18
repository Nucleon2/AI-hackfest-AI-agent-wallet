"use client";

import { motion } from "motion/react";
import { BorderBeam } from "@/components/ui/border-beam";
import { MagicCard } from "@/components/ui/magic-card";
import { solscanUrl, type SolanaNetwork } from "@/lib/solanaClient";
import { shortAddress } from "@/lib/transactionBuilder";

export interface ExplanationCardProps {
  signature: string;
  summary: string;
  explanation: string;
  feeSol: number;
  walletSolDelta: number | null;
  txSuccess: boolean;
  network: SolanaNetwork;
  blockTime: number | null;
}

function formatSol(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (Math.abs(n) < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatSignedSol(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${formatSol(Math.abs(n))}`;
}

function formatTimestamp(blockTime: number | null): string | null {
  if (!blockTime) return null;
  const ms = blockTime * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ExplanationCard(props: ExplanationCardProps) {
  const { signature, summary, explanation, feeSol, walletSolDelta, txSuccess, network, blockTime } =
    props;
  const url = solscanUrl(signature);
  const iconBg = txSuccess ? "bg-indigo-500/20 text-indigo-300" : "bg-red-500/20 text-red-300";
  const solscanBtn = txSuccess
    ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20"
    : "border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20";
  const timestamp = formatTimestamp(blockTime);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative rounded-2xl overflow-hidden"
    >
      <MagicCard
        gradientColor="#6366f1"
        gradientOpacity={0.12}
        className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/50">
                {txSuccess ? "Transaction explained" : "Transaction failed"}
              </div>
              <div className="text-sm font-medium text-white leading-snug">
                {summary}
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
            {network}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-white/80">{explanation}</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Fee
            </div>
            <div className="mt-0.5 font-mono text-xs text-white/90">
              {formatSol(feeSol)} SOL
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Your balance change
            </div>
            <div
              className={`mt-0.5 font-mono text-xs ${
                walletSolDelta === null
                  ? "text-white/60"
                  : walletSolDelta > 0
                    ? "text-emerald-300"
                    : walletSolDelta < 0
                      ? "text-amber-300"
                      : "text-white/60"
              }`}
            >
              {walletSolDelta === null
                ? "—"
                : `${formatSignedSol(walletSolDelta)} SOL`}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex flex-col min-w-0">
            <span className="truncate font-mono text-[11px] text-white/50">
              {shortAddress(signature, 10, 10)}
            </span>
            {timestamp && (
              <span className="text-[10px] text-white/35">{timestamp}</span>
            )}
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${solscanBtn}`}
          >
            Solscan
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17L17 7M17 7H9M17 7V15" />
            </svg>
          </a>
        </div>
      </MagicCard>
      <BorderBeam
        size={150}
        duration={10}
        colorFrom={txSuccess ? "#6366f1" : "#ef4444"}
        colorTo={txSuccess ? "#8b5cf6" : "#f59e0b"}
        borderWidth={1}
      />
    </motion.div>
  );
}
