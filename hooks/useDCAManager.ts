"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DCAOrder, PriceAlert } from "@/types/intent";
import { useDCAStore } from "@/lib/stores/dcaStore";

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

  const setStoreCounts = useDCAStore((s) => s.setCounts);
  const resetStore = useDCAStore((s) => s.reset);

  const refresh = useCallback(async () => {
    if (!walletPubkey) {
      setOrders([]);
      setAlerts([]);
      resetStore();
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
      if (!json.success) return;
      // Clear stale due state when the server reports nothing due, or when the
      // due id no longer matches — prevents a cancelled order from triggering
      // auto-execute on the next tick.
      setDueOrder((prev) => {
        const next = json.data[0] ?? null;
        if (!next) return null;
        if (prev && prev.id === next.id) return prev;
        return next;
      });
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
      if (!json.success) return;
      // Keep local alerts state fresh from the fetch itself — no need for a
      // follow-up refresh() unless an alert actually fires.
      setAlerts(json.data);
      if (json.data.length === 0) return;

      const uniqueTokens = Array.from(new Set(json.data.map((a) => a.token)));
      const prices = await fetchPrices(uniqueTokens);

      let anyTriggered = false;
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
          anyTriggered = true;
          onAlertRef.current({ alert, currentPrice: price });
        }
      }
      if (anyTriggered) await refresh();
    } catch {
      // ignore
    }
  }, [walletPubkey, refresh]);

  // Publish counts to the store so sibling UI (e.g. Sidebar) can read them
  // without spinning up a second polling loop.
  useEffect(() => {
    setStoreCounts(orders.length, alerts.length);
  }, [orders.length, alerts.length, setStoreCounts]);

  useEffect(() => {
    if (!walletPubkey) {
      setOrders([]);
      setAlerts([]);
      setDueOrder(null);
      resetStore();
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
  }, [walletPubkey, refresh, pollDue, pollAlerts, resetStore]);

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
