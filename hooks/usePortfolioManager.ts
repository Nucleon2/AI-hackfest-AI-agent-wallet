"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PortfolioConfig, PortfolioStatus, RebalanceSwap } from "@/types/intent";

export interface UsePortfolioManagerReturn {
  config: PortfolioConfig | null;
  status: PortfolioStatus | null;
  isRebalancing: boolean;
  pendingSwaps: RebalanceSwap[] | null;
  rebalanceReasoning: string | null;
  error: string | null;
  triggerRebalance: () => Promise<void>;
  dismissPendingSwaps: () => void;
  refreshStatus: () => Promise<void>;
  updateConfig: (updates: Partial<Pick<PortfolioConfig, "is_active" | "auto_execute" | "drift_threshold">>) => Promise<void>;
}

export function usePortfolioManager(
  walletPubkey: string | null,
  onExecuteSwap: (swap: RebalanceSwap) => Promise<boolean>
): UsePortfolioManagerReturn {
  const [config, setConfig] = useState<PortfolioConfig | null>(null);
  const [status, setStatus] = useState<PortfolioStatus | null>(null);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [pendingSwaps, setPendingSwaps] = useState<RebalanceSwap[] | null>(null);
  const [rebalanceReasoning, setRebalanceReasoning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRebalancingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExecuteSwapRef = useRef(onExecuteSwap);
  onExecuteSwapRef.current = onExecuteSwap;

  const fetchStatus = useCallback(async () => {
    if (!walletPubkey) return;
    try {
      const res = await fetch(`/api/portfolio/status?wallet=${walletPubkey}`);
      const json = (await res.json()) as
        | { success: true; data: PortfolioStatus | null }
        | { success: false; error?: string };
      if (json.success && json.data) {
        setStatus(json.data);
        setConfig(json.data.config);
      } else if (json.success && json.data === null) {
        setStatus(null);
        // load config separately if status has no data (wallet has no holdings)
        const cfgRes = await fetch(`/api/portfolio/config?wallet=${walletPubkey}`);
        const cfgJson = (await cfgRes.json()) as
          | { success: true; data: PortfolioConfig | null }
          | { success: false };
        if (cfgJson.success) setConfig(cfgJson.data);
      }
    } catch {
      // network errors are non-fatal for polling
    }
  }, [walletPubkey]);

  const runRebalanceCheck = useCallback(async () => {
    if (!walletPubkey || isRebalancingRef.current) return;
    if (!status?.needsRebalance) return;
    if (!config?.is_active) return;

    isRebalancingRef.current = true;
    setIsRebalancing(true);
    setError(null);

    try {
      const res = await fetch("/api/portfolio/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey }),
      });
      const json = (await res.json()) as
        | { success: true; data: { needsRebalance: boolean; swaps: RebalanceSwap[]; reasoning: string } }
        | { success: false; error?: string };

      if (!json.success) {
        setError(json.error ?? "Rebalance check failed");
        return;
      }

      if (!json.data.needsRebalance || json.data.swaps.length === 0) {
        return;
      }

      setRebalanceReasoning(json.data.reasoning);

      if (config.auto_execute) {
        for (const swap of json.data.swaps) {
          const ok = await onExecuteSwapRef.current(swap);
          if (!ok) {
            setError(`Rebalance swap failed: ${swap.fromToken} → ${swap.toToken}`);
            break;
          }
        }
        // Mark last rebalanced
        await fetch("/api/portfolio/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletPubkey, last_rebalanced_at: Date.now() }),
        });
        setConfig((prev) => prev ? { ...prev, last_rebalanced_at: Date.now() } : prev);
        await fetchStatus();
      } else {
        setPendingSwaps(json.data.swaps);
      }
    } finally {
      isRebalancingRef.current = false;
      setIsRebalancing(false);
    }
  }, [walletPubkey, status, config, fetchStatus]);

  // Load config on wallet connect
  useEffect(() => {
    if (!walletPubkey) {
      setConfig(null);
      setStatus(null);
      return;
    }
    fetch(`/api/portfolio/config?wallet=${walletPubkey}`)
      .then((r) => r.json())
      .then((json: { success: boolean; data?: PortfolioConfig | null }) => {
        if (json.success) setConfig(json.data ?? null);
      })
      .catch(() => {});
  }, [walletPubkey]);

  // Poll every 30s
  useEffect(() => {
    if (!walletPubkey) return;

    fetchStatus();

    intervalRef.current = setInterval(async () => {
      await fetchStatus();
    }, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [walletPubkey, fetchStatus]);

  // Trigger rebalance check when status updates and needs rebalance
  useEffect(() => {
    if (status?.needsRebalance && config?.is_active && !pendingSwaps) {
      runRebalanceCheck();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.needsRebalance, config?.is_active]);

  const triggerRebalance = useCallback(async () => {
    await fetchStatus();
    await runRebalanceCheck();
  }, [fetchStatus, runRebalanceCheck]);

  const dismissPendingSwaps = useCallback(() => {
    setPendingSwaps(null);
    setRebalanceReasoning(null);
    isRebalancingRef.current = false;
    setIsRebalancing(false);
  }, []);

  const updateConfig = useCallback(
    async (updates: Partial<Pick<PortfolioConfig, "is_active" | "auto_execute" | "drift_threshold">>) => {
      if (!walletPubkey) return;
      const res = await fetch("/api/portfolio/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey, ...updates }),
      });
      const json = (await res.json()) as { success: boolean; data?: PortfolioConfig | null };
      if (json.success && json.data) setConfig(json.data);
    },
    [walletPubkey]
  );

  return {
    config,
    status,
    isRebalancing,
    pendingSwaps,
    rebalanceReasoning,
    error,
    triggerRebalance,
    dismissPendingSwaps,
    refreshStatus: fetchStatus,
    updateConfig,
  };
}
