"use client";

import { solscanUrl, type SolanaNetwork } from "@/lib/solanaClient";
import { shortAddress } from "@/lib/transactionBuilder";

interface ReceiptCardProps {
  signature: string;
  amount: number;
  token: string;
  recipient: string;
  network: SolanaNetwork;
}

export function ReceiptCard({
  signature,
  amount,
  token,
  recipient,
  network,
}: ReceiptCardProps) {
  const url = solscanUrl(signature);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-emerald-500/5 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-emerald-300/70">
              Transaction sent
            </div>
            <div className="text-sm font-medium text-white">
              {amount} {token} → {shortAddress(recipient, 4, 4)}
            </div>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
          {network}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/20 px-3 py-2">
        <span className="truncate font-mono text-[11px] text-white/50">
          {shortAddress(signature, 10, 10)}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-200 transition-colors hover:bg-indigo-500/20"
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
    </div>
  );
}
