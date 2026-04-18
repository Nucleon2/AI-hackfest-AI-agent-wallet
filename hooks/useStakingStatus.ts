"use client";

import { useEffect } from "react";
import { create } from "zustand";
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

interface Store {
  status: StakingStatus | null;
  loading: boolean;
  error: string | null;
}

const POLL_MS = 60_000;

// Module-scoped polling state: one interval per app, regardless of how
// many components mount useStakingStatus. React Strict Mode runs effects
// twice in dev, so we refcount subscribers and only poll while at least
// one is mounted.
let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentWallet: string | null = null;
let subscriberCount = 0;
// Monotonic epoch: any in-flight response whose epoch doesn't match the
// current one is dropped (wallet switched or all subscribers unmounted).
let requestEpoch = 0;

const useStore = create<Store>(() => ({
  status: null,
  loading: false,
  error: null,
}));

async function fetchStatus(wallet: string, epoch: number) {
  try {
    const res = await fetch(
      `/api/stake/status?wallet=${encodeURIComponent(wallet)}`,
      { cache: "no-store" }
    );
    if (epoch !== requestEpoch) return;
    const json = (await res.json()) as
      | { success: true; data: StakingStatus }
      | { success: false; error: string };
    if (epoch !== requestEpoch) return;
    if (json.success) {
      useStore.setState({ status: json.data, error: null, loading: false });
    } else {
      useStore.setState({ error: json.error, loading: false });
    }
  } catch (err) {
    if (epoch !== requestEpoch) return;
    useStore.setState({
      error: err instanceof Error ? err.message : "Request failed.",
      loading: false,
    });
  }
}

function stopPolling() {
  requestEpoch += 1; // invalidate any in-flight response
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  currentWallet = null;
}

function startPolling(wallet: string) {
  requestEpoch += 1;
  const epoch = requestEpoch;
  currentWallet = wallet;
  useStore.setState({ status: null, error: null, loading: true });
  void fetchStatus(wallet, epoch);
  pollTimer = setInterval(() => {
    if (currentWallet) void fetchStatus(currentWallet, epoch);
  }, POLL_MS);
}

function subscribe(wallet: string | null): () => void {
  subscriberCount += 1;
  if (wallet !== currentWallet) {
    stopPolling();
    useStore.setState({ status: null, error: null, loading: false });
    if (wallet) startPolling(wallet);
  }
  return () => {
    subscriberCount -= 1;
    if (subscriberCount === 0) {
      stopPolling();
      useStore.setState({ status: null, error: null, loading: false });
    }
  };
}

export function useStakingStatus() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const status = useStore((s) => s.status);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);

  useEffect(() => {
    return subscribe(wallet);
  }, [wallet]);

  function refresh() {
    if (currentWallet) void fetchStatus(currentWallet, requestEpoch);
  }

  return { status, loading, error, refresh };
}
