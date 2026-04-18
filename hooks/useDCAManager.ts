"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DCAOrder, PriceAlert } from "@/types/intent";

export interface TriggeredAlert {
  alert: PriceAlert;
  currentPrice: number;
}

export interface UseDCAManagerReturn {
  orders: DCAOrder[];
  alerts: PriceAlert[];
  dueOrder: DCAOrder | null;
  loading: boolean;
  refresh: () => Promise<void>;
  cancelOrder: (id: string) => Promise<boolean>;
  deleteAlert: (id: string) => Promise<boolean>;
  clearDueOrder: () => void;
}

async function fetchPrices(tokens: string[]): Promise<Record<string, number>> {
  if (tokens.length === 0) return {};
  const url = `/api/price?${tokens.map((t) => `token=${encodeURIComponent(t)}`).join("&")}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as
    | { success: true; data: Record<string, number> }
    | { success: false; error?: string };
  if (!json.success) return {};
  return json.data;
}

export function useDCAManager(
  walletPubkey: string | null,
  onAlertTriggered: (triggered: TriggeredAlert) => void
): UseDCAManagerReturn {
  const [orders, setOrders] = useState<DCAOrder[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [dueOrder, setDueOrder] = useState<DCAOrder | null>(null);
  const [loading, setLoading] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onAlertRef = useRef(onAlertTriggered);
  onAlertRef.current = onAlertTriggered;

  const refresh = useCallback(async () => {
    if (!walletPubkey) {
      setOrders([]);
      setAlerts([]);
      return;
    }
    setLoading(true);
    try {
      const [ordersRes, alertsRes] = await Promise.all([
        fetch(`/api/dca?wallet=${walletPubkey}`),
        fetch(`/api/price-alerts?wallet=${walletPubkey}`),
      ]);
      const ordersJson = (await ordersRes.json()) as
        | { success: true; data: DCAOrder[] }
        | { success: false };
      const alertsJson = (await alertsRes.json()) as
        | { success: true; data: PriceAlert[] }
        | { success: false };
      if (ordersJson.success) setOrders(ordersJson.data);
      if (alertsJson.success) setAlerts(alertsJson.data);
    } finally {
      setLoading(false);
    }
  }, [walletPubkey]);

  const pollDue = useCallback(async () => {
    if (!walletPubkey) return;
    try {
      const res = await fetch(`/api/dca/due?wallet=${walletPubkey}`);
      const json = (await res.json()) as
        | { success: true; data: DCAOrder[] }
        | { success: false };
      if (json.success && json.data.length > 0) {
        setDueOrder(json.data[0]);
      }
    } catch {
      // ignore polling errors
    }
  }, [walletPubkey]);

  const pollAlerts = useCallback(async () => {
    if (!walletPubkey) return;
    try {
      const res = await fetch(`/api/price-alerts?wallet=${walletPubkey}`);
      const json = (await res.json()) as
        | { success: true; data: PriceAlert[] }
        | { success: false };
      if (!json.success || json.data.length === 0) return;

      const uniqueTokens = Array.from(new Set(json.data.map((a) => a.token)));
      const prices = await fetchPrices(uniqueTokens);

      for (const alert of json.data) {
        const price = prices[alert.token];
        if (!price || price <= 0) continue;
        const crossed =
          (alert.direction === "above" && price >= alert.target_price) ||
          (alert.direction === "below" && price <= alert.target_price);
        if (!crossed) continue;

        const markRes = await fetch(`/api/price-alerts/${alert.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletPubkey }),
        });
        const markJson = (await markRes.json()) as { success: boolean };
        if (markJson.success) {
          onAlertRef.current({ alert, currentPrice: price });
        }
      }
      await refresh();
    } catch {
      // ignore
    }
  }, [walletPubkey, refresh]);

  useEffect(() => {
    if (!walletPubkey) {
      setOrders([]);
      setAlerts([]);
      setDueOrder(null);
      return;
    }
    refresh();
    pollDue();
    pollAlerts();
    intervalRef.current = setInterval(async () => {
      await pollDue();
      await pollAlerts();
    }, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [walletPubkey, refresh, pollDue, pollAlerts]);

  const cancelOrder = useCallback(
    async (id: string): Promise<boolean> => {
      if (!walletPubkey) return false;
      const res = await fetch(`/api/dca/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey }),
      });
      const json = (await res.json()) as { success: boolean };
      if (json.success) await refresh();
      return json.success;
    },
    [walletPubkey, refresh]
  );

  const deleteAlert = useCallback(
    async (id: string): Promise<boolean> => {
      if (!walletPubkey) return false;
      const res = await fetch(`/api/price-alerts/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey }),
      });
      const json = (await res.json()) as { success: boolean };
      if (json.success) await refresh();
      return json.success;
    },
    [walletPubkey, refresh]
  );

  const clearDueOrder = useCallback(() => setDueOrder(null), []);

  return {
    orders,
    alerts,
    dueOrder,
    loading,
    refresh,
    cancelOrder,
    deleteAlert,
    clearDueOrder,
  };
}
