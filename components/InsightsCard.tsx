"use client";

import { motion } from "motion/react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BorderBeam } from "@/components/ui/border-beam";
import { MagicCard } from "@/components/ui/magic-card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { solscanUrl, type SolanaNetwork } from "@/lib/solanaClient";
import { shortAddress } from "@/lib/transactionBuilder";

export type CategoryName =
  | "transfer_sent"
  | "transfer_received"
  | "swap"
  | "fee_only"
  | "stake"
  | "other";

export interface InsightCategory {
  name: CategoryName | string;
  count: number;
  totalSol: number;
}

export interface InsightRecipient {
  address: string;
  count: number;
  totalSol: number;
}

export interface InsightBiggestTx {
  signature: string;
  solAmount: number;
  note: string;
}

export interface InsightsPayload {
  categories: InsightCategory[];
  topRecipients: InsightRecipient[];
  biggestTx: InsightBiggestTx | null;
  narrative: string;
  totalSolOut: number;
  totalSolIn: number;
  totalFeePaidSol: number;
  txCount: number;
  network: SolanaNetwork;
}

const CATEGORY_LABELS: Record<string, string> = {
  transfer_sent: "Sent",
  transfer_received: "Received",
  swap: "Swaps",
  fee_only: "Fees only",
  stake: "Staking",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  transfer_sent: "#f59e0b", // amber
  transfer_received: "#10b981", // emerald
  swap: "#6366f1", // indigo
  fee_only: "#ffffff40",
  stake: "#8b5cf6", // violet
  other: "#ffffff30",
};

function labelFor(name: string): string {
  return CATEGORY_LABELS[name] ?? name;
}

function colorFor(name: string): string {
  return CATEGORY_COLORS[name] ?? "#ffffff40";
}

function formatSol(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (Math.abs(n) < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

interface TooltipPayload {
  payload: { name: string; count: number; totalSol: number };
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="font-medium text-white">{labelFor(data.name)}</div>
      <div className="text-white/60">{data.count} tx</div>
      <div className="text-white/60">{formatSol(data.totalSol)} SOL</div>
    </div>
  );
}

export function InsightsCard({ data }: { data: InsightsPayload }) {
  const {
    categories,
    topRecipients,
    biggestTx,
    narrative,
    totalSolOut,
    totalFeePaidSol,
    txCount,
    network,
  } = data;

  const chartData = categories.map((c) => ({
    name: c.name,
    label: labelFor(c.name),
    count: c.count,
    totalSol: c.totalSol,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative rounded-2xl overflow-hidden"
    >
      <MagicCard
        gradientColor="#8b5cf6"
        gradientOpacity={0.12}
        className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M7 15l4-4 3 3 5-6" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/50">
                Spending insights
              </div>
              <div className="text-sm font-medium text-white">
                Last {txCount} transaction{txCount === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
            {network}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              SOL sent
            </div>
            <div className="mt-0.5 font-mono text-sm text-amber-300">
              <NumberTicker value={totalSolOut} decimalPlaces={4} />
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Fees paid
            </div>
            <div className="mt-0.5 font-mono text-sm text-white/80">
              <NumberTicker value={totalFeePaidSol} decimalPlaces={5} />
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Transactions
            </div>
            <div className="mt-0.5 font-mono text-sm text-white/80">
              <NumberTicker value={txCount} />
            </div>
          </div>
        </div>

        {narrative && (
          <p className="italic text-sm leading-relaxed text-white/70">
            {narrative}
          </p>
        )}

        {chartData.length > 0 ? (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  content={<ChartTooltip />}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={colorFor(entry.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-4 text-center text-xs text-white/50">
            Not enough activity to chart yet.
          </div>
        )}

        {topRecipients.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Top recipients
            </div>
            {topRecipients.map((r) => (
              <div
                key={r.address}
                className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5"
              >
                <span className="font-mono text-xs text-white/80">
                  {shortAddress(r.address, 6, 6)}
                </span>
                <span className="text-xs text-white/50">
                  {r.count}× · {formatSol(r.totalSol)} SOL
                </span>
              </div>
            ))}
          </div>
        )}

        {biggestTx && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-amber-300/70">
                  Biggest transaction
                </div>
                <div className="mt-0.5 text-xs text-white/85">{biggestTx.note}</div>
                <div className="mt-0.5 font-mono text-[11px] text-white/40">
                  {shortAddress(biggestTx.signature, 8, 8)} · {formatSol(biggestTx.solAmount)} SOL
                </div>
              </div>
              <a
                href={solscanUrl(biggestTx.signature)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200 transition-colors hover:bg-amber-500/20"
              >
                Solscan
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 17L17 7M17 7H9M17 7V15" />
                </svg>
              </a>
            </div>
          </div>
        )}
      </MagicCard>
      <BorderBeam
        size={150}
        duration={12}
        colorFrom="#8b5cf6"
        colorTo="#6366f1"
        borderWidth={1}
      />
    </motion.div>
  );
}
