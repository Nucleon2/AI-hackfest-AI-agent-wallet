"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  // Per-wallet epoch — bumps whenever publicKey changes. Any in-flight
  // fetch whose epoch no longer matches drops its result on the floor,
  // preventing a slow response from a previous wallet from overwriting
  // the current wallet's state.
  const epochRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setStatus(null);
      return;
    }
    const myEpoch = epochRef.current;
    // Only show the loading shimmer on the very first fetch; subsequent
    // 60s polls would otherwise flash the card every minute.
    setStatus((prev) => {
      if (prev === null) setLoading(true);
      return prev;
    });
    try {
      const res = await fetch(
        `/api/stake/status?wallet=${encodeURIComponent(publicKey.toBase58())}`,
        { cache: "no-store" }
      );
      if (myEpoch !== epochRef.current) return;
      const json = (await res.json()) as
        | { success: true; data: StakingStatus }
        | { success: false; error: string };
      if (myEpoch !== epochRef.current) return;
      if (json.success) {
        setStatus(json.data);
        setError(null);
      } else {
        setError(json.error);
      }
    } catch (err) {
      if (myEpoch !== epochRef.current) return;
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      if (myEpoch === epochRef.current) setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    epochRef.current += 1;
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
