import type { ScheduleIntent } from "@/types/intent";
import type { ScheduledPayment } from "@/types/schedule";

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function computeFirstExecutionAt(
  intent: ScheduleIntent,
  nowMs: number
): number {
  const { frequency, day_of_week, scheduled_date } = intent;

  if (frequency === "once") {
    return parseScheduledDate(scheduled_date, nowMs);
  }
  if (frequency === "daily") {
    return startOfTomorrow(nowMs);
  }
  if (frequency === "weekly") {
    const targetDay = DAY_NAMES.indexOf(
      (day_of_week ?? "monday").toLowerCase()
    );
    return nextWeekday(targetDay < 0 ? 1 : targetDay, nowMs);
  }
  if (frequency === "monthly") {
    return nextMonthSameDay(nowMs);
  }
  return nowMs + 24 * 60 * 60 * 1000;
}

export function computeNextExecutionAt(
  row: ScheduledPayment
): number | null {
  if (row.frequency === "once") return null;
  if (row.frequency === "daily") {
    return row.next_execution_at + 24 * 60 * 60 * 1000;
  }
  if (row.frequency === "weekly") {
    return row.next_execution_at + 7 * 24 * 60 * 60 * 1000;
  }
  if (row.frequency === "monthly") {
    return addOneMonth(row.next_execution_at);
  }
  return null;
}

function parseScheduledDate(
  scheduled_date: string | undefined,
  nowMs: number
): number {
  if (!scheduled_date) return nowMs + 24 * 60 * 60 * 1000;

  const minutesMatch = scheduled_date.match(/^in (\d+) min(utes?)?$/i);
  if (minutesMatch) return nowMs + parseInt(minutesMatch[1]) * 60 * 1000;

  const hoursMatch = scheduled_date.match(/^in (\d+) hours?$/i);
  if (hoursMatch) return nowMs + parseInt(hoursMatch[1]) * 60 * 60 * 1000;

  const daysMatch = scheduled_date.match(/^in (\d+) days?$/i);
  if (daysMatch) return nowMs + parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000;

  const isoMatch = scheduled_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const ts = Date.UTC(
      parseInt(isoMatch[1]),
      parseInt(isoMatch[2]) - 1,
      parseInt(isoMatch[3])
    );
    return ts > nowMs ? ts : nowMs + 60 * 60 * 1000;
  }

  return nowMs + 24 * 60 * 60 * 1000;
}

function startOfTomorrow(nowMs: number): number {
  const d = new Date(nowMs);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function nextWeekday(targetDay: number, nowMs: number): number {
  const d = new Date(nowMs);
  const current = d.getUTCDay();
  let daysUntil = (targetDay - current + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  d.setUTCDate(d.getUTCDate() + daysUntil);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function nextMonthSameDay(nowMs: number): number {
  const d = new Date(nowMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const maxDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  return Date.UTC(nextYear, nextMonth, Math.min(day, maxDay));
}

function addOneMonth(tsMs: number): number {
  const d = new Date(tsMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const maxDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  return Date.UTC(nextYear, nextMonth, Math.min(day, maxDay));
}
