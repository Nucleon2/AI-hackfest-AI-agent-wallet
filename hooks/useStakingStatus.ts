"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export interface StakingStatus {
  msolBalance: number;
  jitoBalance: number;
  apy: number;
  jitoApy: number;
  mSolPrice: number;
  stakedSol: number;
  estimatedYieldSolPerYear: number;
  estimatedDailyYieldSol: number;
  estimatedMonthlyYieldSol: number;
}

const POLL_MS = 60_000;

export function useStakingStatus() {
  const { publicKey } = useWallet();
  const [status, setStatus] = useState<StakingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/stake/status?wallet=${encodeURIComponent(publicKey.toBase58())}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as
        | { success: true; data: StakingStatus }
        | { success: false; error: string };
      if (json.success) {
        setStatus(json.data);
        setError(null);
      } else {
        setError(json.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey) {
      setStatus(null);
      return;
    }
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [publicKey, refresh]);

  return { status, loading, error, refresh };
}
