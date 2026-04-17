"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, type PublicKey } from "@solana/web3.js";

export interface HistoryItem {
  signature: string;
  blockTime: number | null;
  slot: number;
  success: boolean;
  solDelta: number | null;
  memo: string | null;
}

interface UseTransactionHistoryResult {
  transactions: HistoryItem[];
  loading: boolean;
  error: string | null;
}

function normalizeMemo(memo: string | null | undefined): string | null {
  if (!memo) return null;
  const trimmed = memo.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/]\s*(.*)$/);
  return (match ? match[1] : trimmed).trim() || null;
}

export function useTransactionHistory(
  limit: number
): UseTransactionHistoryResult {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [transactions, setTransactions] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setTransactions([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function run(owner: PublicKey) {
      try {
        const sigs = await connection.getSignaturesForAddress(owner, { limit });
        if (cancelled) return;

        const parsed = await Promise.all(
          sigs.map((sig) =>
            connection
              .getParsedTransaction(sig.signature, {
                maxSupportedTransactionVersion: 0,
              })
              .catch(() => null)
          )
        );
        if (cancelled) return;

        const ownerBase58 = owner.toBase58();
        const items: HistoryItem[] = sigs.map((sig, i) => {
          const tx = parsed[i];
          let solDelta: number | null = null;
          if (tx && tx.meta) {
            const keys = tx.transaction.message.accountKeys;
            const idx = keys.findIndex(
              (k) => k.pubkey.toBase58() === ownerBase58
            );
            if (
              idx >= 0 &&
              tx.meta.preBalances[idx] !== undefined &&
              tx.meta.postBalances[idx] !== undefined
            ) {
              const delta =
                tx.meta.postBalances[idx] - tx.meta.preBalances[idx];
              solDelta = delta / LAMPORTS_PER_SOL;
            }
          }

          return {
            signature: sig.signature,
            blockTime: sig.blockTime ?? null,
            slot: sig.slot,
            success: sig.err === null,
            solDelta,
            memo: normalizeMemo(sig.memo),
          };
        });

        setTransactions(items);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to fetch history.";
        setError(msg);
        setTransactions([]);
        setLoading(false);
      }
    }

    run(publicKey);

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, limit]);

  return { transactions, loading, error };
}
