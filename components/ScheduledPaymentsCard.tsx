"use client";

import type { ScheduledPayment } from "@/types/schedule";
import { BorderBeam } from "@/components/ui/border-beam";
import { shortAddress } from "@/lib/transactionBuilder";
import { cn } from "@/lib/utils";

interface Props {
  schedules: ScheduledPayment[];
  onCancel: (id: string) => void;
  loading?: boolean;
}

export function ScheduledPaymentsCard({ schedules, onCancel, loading }: Props) {
  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl bg-white/5"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <BorderBeam
        size={80}
        duration={8}
        colorFrom="#6366f1"
        colorTo="#a78bfa"
        borderWidth={1}
      />
      <div className="mb-3 text-[11px] uppercase tracking-widest text-white/40">
        Scheduled Payments
      </div>
      {schedules.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <ScheduleRow key={s.id} schedule={s} onCancel={onCancel} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({
  schedule,
  onCancel,
}: {
  schedule: ScheduledPayment;
  onCancel: (id: string) => void;
}) {
  const isOverdue = schedule.next_execution_at < Date.now();

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-white">
            {schedule.amount_sol}{" "}
            <span className="text-white/60">{schedule.token}</span>
          </span>
          <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-px text-[10px] text-indigo-300">
            {schedule.label ?? schedule.frequency}
          </span>
          {schedule.execution_count > 0 && (
            <span className="text-[10px] text-white/30">
              {schedule.execution_count}x done
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/40">
          <span className="font-mono">
            {shortAddress(schedule.recipient, 4, 4)}
          </span>
          <span>·</span>
          <span className={cn(isOverdue && "text-amber-400/70")}>
            {isOverdue
              ? "Due now"
              : formatNextDate(new Date(schedule.next_execution_at))}
          </span>
        </div>
      </div>
      <button
        onClick={() => onCancel(schedule.id)}
        className="shrink-0 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 transition-colors hover:bg-rose-500/20"
      >
        Cancel
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-4 text-center text-sm text-white/30">
      No scheduled payments. Try &ldquo;Send 5 SOL every Friday&rdquo;.
    </div>
  );
}

function formatNextDate(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return `In ${Math.max(1, Math.round(diffMs / 60000))} min`;
  if (diffH < 24) return `In ${Math.round(diffH)}h`;
  if (diffH < 48) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
