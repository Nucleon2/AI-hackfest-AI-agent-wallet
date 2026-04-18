import type { DCAOrder } from "@/types/intent";
import {
  addOneMonth,
  nextMonthSameDay,
  nextWeekday,
  startOfTomorrow,
} from "@/lib/scheduleUtils";

export const DCA_DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function parseDayOfWeek(name: string | undefined | null): number | null {
  if (!name) return null;
  const idx = DCA_DAY_NAMES.indexOf(name.toLowerCase());
  return idx >= 0 ? idx : null;
}

export function computeFirstDCARun(
  interval: "daily" | "weekly" | "monthly",
  dayOfWeek: number | null,
  nowMs: number
): number {
  if (interval === "daily") return startOfTomorrow(nowMs);
  if (interval === "weekly") {
    const target = dayOfWeek ?? 1;
    return nextWeekday(target, nowMs);
  }
  if (interval === "monthly") return nextMonthSameDay(nowMs);
  return nowMs + 24 * 60 * 60 * 1000;
}

export function computeNextDCARun(order: DCAOrder): number {
  if (order.interval === "daily") {
    return order.next_run_at + 24 * 60 * 60 * 1000;
  }
  if (order.interval === "weekly") {
    return order.next_run_at + 7 * 24 * 60 * 60 * 1000;
  }
  if (order.interval === "monthly") {
    return addOneMonth(order.next_run_at);
  }
  return order.next_run_at + 24 * 60 * 60 * 1000;
}
