"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduledPayment } from "@/types/schedule";

export function useScheduledPayments(walletPubkey: string | null) {
  const [schedules, setSchedules] = useState<ScheduledPayment[]>([]);
  const [duePayment, setDuePayment] = useState<ScheduledPayment | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!walletPubkey) {
      setSchedules([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/schedules?wallet=${walletPubkey}`);
      const json = (await res.json()) as
        | { success: true; data: ScheduledPayment[] }
        | { success: false; error: string };
      if (json.success) setSchedules(json.data);
    } finally {
      setLoading(false);
    }
  }, [walletPubkey]);

  const pollDue = useCallback(async () => {
    if (!walletPubkey) return;
    try {
      const res = await fetch(`/api/schedules/due?wallet=${walletPubkey}`);
      const json = (await res.json()) as
        | { success: true; data: ScheduledPayment[] }
        | { success: false; error: string };
      if (json.success && json.data.length > 0) {
        setDuePayment(json.data[0]);
      }
    } catch {
      // silently ignore polling errors
    }
  }, [walletPubkey]);

  useEffect(() => {
    if (!walletPubkey) {
      setSchedules([]);
      setDuePayment(null);
      return;
    }
    refresh();
    pollDue();
    intervalRef.current = setInterval(pollDue, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [walletPubkey, refresh, pollDue]);

  const clearDue = useCallback(() => setDuePayment(null), []);

  return { schedules, duePayment, loading, refresh, clearDue };
}
