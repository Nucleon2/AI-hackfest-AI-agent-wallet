"use client";

import type { DCAOrder, PriceAlert } from "@/types/intent";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

interface Props {
  orders: DCAOrder[];
  alerts: PriceAlert[];
  alertPrices?: Record<string, number>;
  onCancelOrder: (id: string) => void;
  onDeleteAlert: (id: string) => void;
  networkWarning?: string | null;
  loading?: boolean;
}

export function DCACard({
  orders,
  alerts,
  alertPrices,
  onCancelOrder,
  onDeleteAlert,
  networkWarning,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
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
        colorFrom="#14b8a6"
        colorTo="#6366f1"
        borderWidth={1}
      />
      <div className="mb-3 text-[11px] uppercase tracking-widest text-white/40">
        Dollar-Cost Averaging
      </div>

      {networkWarning && (
        <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {networkWarning}
        </div>
      )}

      {orders.length === 0 ? (
        <EmptyOrders />
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <DCARow key={o.id} order={o} onCancel={onCancelOrder} />
          ))}
        </div>
      )}

      <div className="mt-5 mb-3 text-[11px] uppercase tracking-widest text-white/40">
        Price Alerts
      </div>
      {alerts.length === 0 ? (
        <EmptyAlerts />
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              currentPrice={alertPrices?.[a.token]}
              onDelete={onDeleteAlert}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DCARow({
  order,
  onCancel,
}: {
  order: DCAOrder;
  onCancel: (id: string) => void;
}) {
  const isOverdue = order.next_run_at < Date.now();
  const hasCap = order.max_runs !== null;
  const pct = hasCap
    ? Math.min(100, (order.runs_completed / (order.max_runs as number)) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">
              ${order.amount_usd}{" "}
              <span className="text-white/60">
                {order.input_token} &rarr; {order.output_token}
              </span>
            </span>
            <span className="rounded-full border border-teal-500/20 bg-teal-500/10 px-1.5 py-px text-[10px] text-teal-300">
              {order.interval}
            </span>
            {hasCap && (
              <span className="text-[10px] text-white/30">
                {order.runs_completed} / {order.max_runs}
              </span>
            )}
            {!hasCap && order.runs_completed > 0 && (
              <span className="text-[10px] text-white/30">
                {order.runs_completed}x done
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/40">
            <span className={cn(isOverdue && "text-amber-400/70")}>
              {isOverdue
                ? "Due now"
                : `Next: ${formatNextDate(new Date(order.next_run_at))}`}
            </span>
          </div>
        </div>
        <button
          onClick={() => onCancel(order.id)}
          className="shrink-0 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 transition-colors hover:bg-rose-500/20"
        >
          Cancel
        </button>
      </div>
      {hasCap && (
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-400 to-indigo-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function getAlertBadge(alert: PriceAlert): { label: string; className: string } {
  const actionType = alert.action_type ?? "notify";
  if (actionType === "notify") {
    return {
      label: "Notify",
      className: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
    };
  }
  // swap type — infer sub-type from tokens
  const fromToken = alert.swap_from_token ?? "";
  const toToken = alert.swap_to_token ?? "";
  const isStablecoin = (t: string) =>
    t === "USDC" || t === "USDT";

  if (alert.direction === "below" && !isStablecoin(fromToken) && isStablecoin(toToken)) {
    return { label: "Stop-Loss", className: "border-rose-500/20 bg-rose-500/10 text-rose-300" };
  }
  if (alert.direction === "above" && !isStablecoin(fromToken) && isStablecoin(toToken)) {
    return { label: "Take-Profit", className: "border-amber-500/20 bg-amber-500/10 text-amber-300" };
  }
  // dip-buy or generic swap
  return { label: "Dip Buy", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" };
}

function AlertRow({
  alert,
  currentPrice,
  onDelete,
}: {
  alert: PriceAlert;
  currentPrice?: number;
  onDelete: (id: string) => void;
}) {
  const arrow = alert.direction === "above" ? "▲" : "▼";
  const arrowColor = alert.direction === "above" ? "text-emerald-300" : "text-rose-300";
  const badge = getAlertBadge(alert);

  const pctAway =
    currentPrice && currentPrice > 0
      ? ((alert.target_price - currentPrice) / currentPrice) * 100
      : null;
  const isClose = pctAway !== null && Math.abs(pctAway) < 5;

  const swapDesc =
    (alert.action_type ?? "notify") === "swap" &&
    alert.swap_from_token != null &&
    alert.swap_to_token != null
      ? alert.swap_amount_pct != null
        ? `Swap ${alert.swap_amount_pct}% ${alert.swap_from_token} → ${alert.swap_to_token}`
        : alert.swap_amount_fixed != null
          ? `Swap $${alert.swap_amount_fixed} worth of ${alert.swap_from_token} → ${alert.swap_to_token}`
          : null
      : null;

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className={cn("text-[11px]", arrowColor)}>{arrow}</span>
          <span className="text-sm font-medium text-white">{alert.token}</span>
          <span className="text-sm text-white/50">
            {alert.direction === "above" ? "above" : "below"} ${alert.target_price}
          </span>
          <span
            className={cn(
              "rounded-full border px-1.5 py-px text-[10px]",
              badge.className
            )}
          >
            {badge.label}
          </span>
          {pctAway !== null && (
            <span
              className={cn(
                "text-[10px]",
                isClose ? "text-rose-400" : "text-white/30"
              )}
            >
              {pctAway > 0 ? "+" : ""}
              {pctAway.toFixed(1)}% away
            </span>
          )}
        </div>
        <button
          onClick={() => onDelete(alert.id)}
          className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/10"
        >
          Remove
        </button>
      </div>
      {swapDesc && (
        <div className="text-[10px] text-white/30 pl-4">{swapDesc}</div>
      )}
    </div>
  );
}

function EmptyOrders() {
  return (
    <div className="py-3 text-center text-sm text-white/30">
      No DCA orders. Try &ldquo;buy $20 of SOL every Monday&rdquo;.
    </div>
  );
}

function EmptyAlerts() {
  return (
    <div className="py-3 text-center text-sm text-white/30">
      No alerts. Try &ldquo;sell half my SOL if it drops below $150&rdquo;.
    </div>
  );
}

function formatNextDate(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  const diffH = diffMs / (1000 * 60 * 60);
  if (diffH < 1) return `in ${Math.max(1, Math.round(diffMs / 60000))} min`;
  if (diffH < 24) return `in ${Math.round(diffH)}h`;
  if (diffH < 48) return "tomorrow";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
