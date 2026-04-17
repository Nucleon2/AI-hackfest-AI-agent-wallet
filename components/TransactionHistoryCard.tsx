"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  useTransactionHistory,
  type HistoryItem,
} from "@/hooks/useTransactionHistory";
import { solscanUrl } from "@/lib/solanaClient";
import { shortAddress } from "@/lib/transactionBuilder";
import { cn } from "@/lib/utils";

interface Props {
  limit: number;
}

function formatRelativeTime(blockTime: number | null): string {
  if (!blockTime) return "—";
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, nowSec - blockTime);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86_400 * 30) return `${Math.floor(diff / 86_400)}d ago`;
  if (diff < 86_400 * 365) return `${Math.floor(diff / (86_400 * 30))}mo ago`;
  return `${Math.floor(diff / (86_400 * 365))}y ago`;
}

function formatDelta(delta: number | null): string {
  if (delta === null) return "—";
  if (delta === 0) return "0 SOL";
  const sign = delta > 0 ? "+" : "";
  const abs = Math.abs(delta);
  const digits = abs < 0.0001 ? 8 : abs < 1 ? 6 : 4;
  return `${sign}${delta.toFixed(digits)} SOL`;
}

export function TransactionHistoryCard({ limit }: Props) {
  const { connected } = useWallet();
  const { transactions, loading, error } = useTransactionHistory(limit);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-white/40">
          Recent activity
        </div>
        <div className="text-[11px] text-white/30">
          {connected && !loading && !error
            ? `${transactions.length} / ${limit}`
            : null}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {!connected ? (
          <EmptyRow text="Connect your wallet to see history." />
        ) : error ? (
          <ErrorRow message={error} />
        ) : loading ? (
          <SkeletonRows />
        ) : transactions.length === 0 ? (
          <EmptyRow text="No transactions found for this wallet." />
        ) : (
          transactions.map((tx) => <HistoryRow key={tx.signature} tx={tx} />)
        )}
      </div>
    </div>
  );
}

function HistoryRow({ tx }: { tx: HistoryItem }) {
  const url = solscanUrl(tx.signature);
  const deltaPositive = tx.solDelta !== null && tx.solDelta > 0;
  const deltaNegative = tx.solDelta !== null && tx.solDelta < 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          tx.success ? "bg-emerald-400" : "bg-rose-400"
        )}
        aria-label={tx.success ? "Success" : "Failed"}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              deltaPositive && "text-emerald-300",
              deltaNegative && "text-rose-300",
              !deltaPositive && !deltaNegative && "text-white/60"
            )}
          >
            {formatDelta(tx.solDelta)}
          </span>
          <span className="shrink-0 text-[11px] text-white/40">
            {formatRelativeTime(tx.blockTime)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="truncate font-mono text-[11px] text-white/35">
            {shortAddress(tx.signature, 6, 6)}
          </span>
          {!tx.success && (
            <span className="shrink-0 rounded-sm border border-rose-400/30 bg-rose-500/10 px-1.5 py-[1px] text-[9px] uppercase tracking-wider text-rose-300">
              failed
            </span>
          )}
          {tx.memo && (
            <span className="truncate text-[11px] text-white/35">
              · {tx.memo}
            </span>
          )}
        </div>
      </div>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-indigo-500/20"
      >
        Solscan
        <svg
          width="10"
          height="10"
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
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
            <div className="h-2 w-40 rounded bg-white/5 animate-pulse" />
          </div>
          <div className="h-6 w-16 rounded-md bg-white/5 animate-pulse" />
        </div>
      ))}
    </>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-center text-xs text-white/40">
      {text}
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-400/25 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
      Couldn&apos;t load history: {message}
    </div>
  );
}
