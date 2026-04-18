"use client";

import { useEffect } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type {
  SendIntent,
  StakeIntent,
  StakingProvider,
  SwapIntent,
  UnstakeIntent,
} from "@/types/intent";
import { BorderBeam } from "@/components/ui/border-beam";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { shortAddress } from "@/lib/transactionBuilder";
import { cn } from "@/lib/utils";
import type { SwapQuoteDisplay } from "@/app/api/swap-quote/route";
import type { TxAnalysis } from "@/app/api/analyze-transaction/route";

export type { SwapQuoteDisplay };

export type PreviewStatus =
  | "building"
  | "ready"
  | "signing"
  | "sending"
  | "confirming"
  | "error";

interface CommonFields {
  status: PreviewStatus;
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  analysis?: TxAnalysis | null;
  isScanning?: boolean;
}

interface SendFields extends CommonFields {
  intent: SendIntent;
  feeLamports?: number | null;
  recipientPubkey?: string | null;
}

interface SwapFields extends CommonFields {
  intent: SwapIntent;
  quote?: SwapQuoteDisplay | null;
}

export interface StakeQuoteDisplay {
  action: "stake" | "unstake";
  provider: StakingProvider;
  inputAmount: number;
  outputAmount: number;
  mSolPrice: number;
  apy: number;
  feePct: number;
}

interface StakeFields extends CommonFields {
  intent: StakeIntent | UnstakeIntent;
  quote?: StakeQuoteDisplay | null;
}

type TransactionPreviewProps = SendFields | SwapFields | StakeFields;

const STATUS_LABEL: Record<PreviewStatus, string> = {
  building: "Preparing transaction…",
  ready: "Confirm",
  signing: "Waiting for wallet…",
  sending: "Broadcasting…",
  confirming: "Confirming on chain…",
  error: "Confirm",
};

function isSwapProps(p: TransactionPreviewProps): p is SwapFields {
  return p.intent.action === "swap";
}

function isStakeProps(p: TransactionPreviewProps): p is StakeFields {
  return p.intent.action === "stake" || p.intent.action === "unstake";
}

function stakeHeaderLabel(intent: StakeIntent | UnstakeIntent): string {
  const provider = intent.provider === "jito" ? "Jito" : "Marinade";
  return intent.action === "stake"
    ? `Confirm stake with ${provider}`
    : `Confirm unstake from ${provider}`;
}

export function TransactionPreview(props: TransactionPreviewProps) {
  const { status, errorMessage, onCancel, onConfirm, isScanning } = props;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && status !== "sending" && status !== "confirming") {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, status]);

  const hasError = Boolean(errorMessage);
  const isBusy =
    status === "signing" || status === "sending" || status === "confirming";
  const canConfirm = status === "ready" && !hasError && !isScanning;
  const isSwap = isSwapProps(props);
  const isStake = isStakeProps(props);
  const headerLabel = isStake
    ? stakeHeaderLabel(props.intent)
    : isSwap
      ? "Confirm swap"
      : "Confirm send";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={headerLabel}
    >
      <button
        type="button"
        aria-label="Close preview"
        disabled={isBusy}
        onClick={onCancel}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm disabled:cursor-not-allowed"
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b14]/95 p-6 shadow-2xl backdrop-blur-xl">
        <BorderBeam
          size={110}
          duration={6}
          colorFrom="#6366f1"
          colorTo="#a78bfa"
          borderWidth={1}
        />

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-white/80 uppercase">
            {headerLabel}
          </h2>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
              hasError
                ? "bg-red-500/15 text-red-300"
                : isBusy
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-indigo-500/15 text-indigo-300"
            )}
          >
            {hasError ? "Error" : status}
          </span>
        </div>

        {props.analysis && <RiskAnalysisSection analysis={props.analysis} />}

        <div className="space-y-3">
          {isStakeProps(props) ? (
            <StakePreviewBody intent={props.intent} quote={props.quote ?? null} />
          ) : isSwapProps(props) ? (
            <SwapPreviewBody intent={props.intent} quote={props.quote ?? null} />
          ) : (
            <SendPreviewBody
              intent={props.intent}
              feeLamports={props.feeLamports ?? null}
              recipientPubkey={props.recipientPubkey ?? null}
            />
          )}

          {hasError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <ShimmerButton
            onClick={onConfirm}
            disabled={!canConfirm}
            shimmerColor="#a5b4fc"
            background="rgba(99, 102, 241, 0.2)"
            borderRadius="12px"
            className="flex-1 border-indigo-500/30 disabled:opacity-40"
          >
            <span className="text-sm text-white">
              {isScanning ? "Scanning…" : STATUS_LABEL[status]}
            </span>
          </ShimmerButton>
        </div>
      </div>
    </div>
  );
}

const RISK_CONFIG = {
  safe:    { bgClass: "bg-emerald-500/10 border-emerald-500/20", textClass: "text-emerald-300", label: "Safe" },
  caution: { bgClass: "bg-amber-500/10 border-amber-500/20",    textClass: "text-amber-300",   label: "Caution" },
  danger:  { bgClass: "bg-red-500/10 border-red-500/20",        textClass: "text-red-300",     label: "Danger" },
};

function RiskAnalysisSection({ analysis }: { analysis: TxAnalysis }) {
  const cfg = RISK_CONFIG[analysis.riskLevel];
  return (
    <div className={`mb-4 rounded-xl border p-3 space-y-2 ${cfg.bgClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.textClass}`}>
            {cfg.label}
          </span>
          <span className="text-[10px] text-white/30">
            {analysis.action} · {analysis.programName}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-white/30">Risk</span>
          <span className={`font-mono text-[10px] font-bold ${cfg.textClass}`}>{analysis.riskScore}</span>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-white/60">{analysis.summary}</p>
      {analysis.warnings.length > 0 && (
        <ul className="space-y-1">
          {analysis.warnings.map((w, i) => (
            <li key={i} className={`flex items-start gap-1.5 text-[11px] ${cfg.textClass}`}>
              <span className="mt-px shrink-0">⚠</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      {analysis.riskLevel === "safe" && analysis.analyzed && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
          <span>✓</span>
          <span>Verified by AI Guard</span>
        </div>
      )}
      {!analysis.analyzed && (
        <div className="text-[10px] text-white/25">AI Guard unavailable</div>
      )}
    </div>
  );
}

function SendPreviewBody({
  intent,
  feeLamports,
  recipientPubkey,
}: {
  intent: SendIntent;
  feeLamports: number | null;
  recipientPubkey: string | null;
}) {
  const displayRecipient = recipientPubkey ?? intent.recipient;
  const feeSol =
    typeof feeLamports === "number" ? feeLamports / LAMPORTS_PER_SOL : null;
  return (
    <>
      <div className="rounded-xl border border-white/8 bg-white/5 p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/40">
          Amount
        </div>
        <div className="mt-1 text-2xl font-semibold text-white">
          {intent.amount} <span className="text-white/60">{intent.token}</span>
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-white/5 p-4">
        <div className="text-[11px] uppercase tracking-wider text-white/40">
          Recipient
        </div>
        <div
          className="mt-1 font-mono text-sm text-white/85"
          title={displayRecipient}
        >
          {shortAddress(displayRecipient, 6, 6)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Network fee
          </div>
          <div className="mt-1 text-sm text-white/85">
            {feeSol !== null ? `~${feeSol.toFixed(6)} SOL` : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Memo
          </div>
          <div className="mt-1 truncate text-sm text-white/85">
            {intent.memo ?? "—"}
          </div>
        </div>
      </div>
    </>
  );
}

function formatImpact(pct: number): { label: string; className: string } {
  if (!Number.isFinite(pct) || pct < 0.01) {
    return { label: "< 0.01%", className: "text-white/85" };
  }
  const label = `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
  if (pct >= 1) return { label, className: "text-red-300" };
  if (pct >= 0.3) return { label, className: "text-amber-300" };
  return { label, className: "text-white/85" };
}

function formatNumber(n: number, maxFrac = 6): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (Math.abs(n) < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, {
    maximumFractionDigits: maxFrac,
  });
}

function SwapPreviewBody({
  intent,
  quote,
}: {
  intent: SwapIntent;
  quote: SwapQuoteDisplay | null;
}) {
  const fromSymbol = quote?.fromSymbol ?? intent.fromToken;
  const toSymbol = quote?.toSymbol ?? intent.toToken;
  const impact = formatImpact(quote?.priceImpactPct ?? 0);
  const slippagePct =
    ((quote?.slippageBps ?? intent.slippageBps ?? 50) / 100).toFixed(2);
  const rate = quote ? quote.rate : null;
  const routeLabel =
    quote?.routeLabels && quote.routeLabels.length > 0
      ? quote.routeLabels.join(" → ")
      : "—";

  return (
    <>
      <div className="rounded-xl border border-white/8 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/40">
              You pay
            </div>
            <div className="mt-1 text-xl font-semibold text-white">
              {formatNumber(quote?.inUiAmount ?? intent.amount)}{" "}
              <span className="text-white/60">{fromSymbol}</span>
            </div>
          </div>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-white/40"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-white/40">
              You receive (est.)
            </div>
            <div className="mt-1 text-xl font-semibold text-white">
              {quote ? formatNumber(quote.outUiAmount) : "—"}{" "}
              <span className="text-white/60">{toSymbol}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Rate
          </div>
          <div className="mt-1 text-sm text-white/85">
            {rate !== null && rate > 0
              ? `1 ${fromSymbol} ≈ ${formatNumber(rate, 6)} ${toSymbol}`
              : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Price impact
          </div>
          <div className={cn("mt-1 text-sm font-medium", impact.className)}>
            {quote ? impact.label : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Slippage
          </div>
          <div className="mt-1 text-sm text-white/85">{slippagePct}%</div>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Route
          </div>
          <div
            className="mt-1 truncate text-sm text-white/85"
            title={routeLabel}
          >
            {routeLabel}
          </div>
        </div>
      </div>

      {quote && (
        <div className="rounded-xl border border-white/8 bg-white/5 p-3 text-[11px] text-white/50">
          Minimum received after slippage: {formatNumber(quote.otherAmountThresholdUi)}{" "}
          {toSymbol}
        </div>
      )}
    </>
  );
}

function StakePreviewBody({
  intent,
  quote,
}: {
  intent: StakeIntent | UnstakeIntent;
  quote: StakeQuoteDisplay | null;
}) {
  const isStake = intent.action === "stake";
  const providerLabel = intent.provider === "jito" ? "Jito" : "Marinade";
  const inSymbol = isStake
    ? "SOL"
    : intent.provider === "jito"
      ? "JitoSOL"
      : "mSOL";
  const outSymbol = isStake
    ? intent.provider === "jito"
      ? "JitoSOL"
      : "mSOL"
    : "SOL";
  const inputAmount =
    quote?.inputAmount ?? (typeof intent.amount === "number" ? intent.amount : 0);
  const outputAmount = quote?.outputAmount ?? null;
  const apyLabel =
    quote && Number.isFinite(quote.apy)
      ? `${(quote.apy * 100).toFixed(2)}%`
      : "—";
  const feeLabel =
    quote && quote.feePct > 0 ? `~${quote.feePct.toFixed(2)}%` : "0%";
  const rateLabel =
    quote && Number.isFinite(quote.mSolPrice) && quote.mSolPrice > 0
      ? isStake
        ? `1 SOL ≈ ${formatNumber(1 / quote.mSolPrice, 6)} mSOL`
        : `1 mSOL ≈ ${formatNumber(quote.mSolPrice, 6)} SOL`
      : "—";

  return (
    <>
      <div className="rounded-xl border border-white/8 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/40">
              You {isStake ? "stake" : "redeem"}
            </div>
            <div className="mt-1 text-xl font-semibold text-white">
              {formatNumber(inputAmount)}{" "}
              <span className="text-white/60">{inSymbol}</span>
            </div>
          </div>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-white/40"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-white/40">
              You receive (est.)
            </div>
            <div className="mt-1 text-xl font-semibold text-white">
              {outputAmount !== null ? formatNumber(outputAmount) : "—"}{" "}
              <span className="text-white/60">{outSymbol}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Provider
          </div>
          <div className="mt-1 text-sm text-white/85">{providerLabel}</div>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            {isStake ? "Current APY" : "Unstake fee"}
          </div>
          <div className="mt-1 text-sm text-white/85">
            {isStake ? apyLabel : feeLabel}
          </div>
        </div>
        <div className="col-span-2 rounded-xl border border-white/8 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Rate
          </div>
          <div className="mt-1 text-sm text-white/85">{rateLabel}</div>
        </div>
      </div>

      {isStake && quote && (
        <div className="rounded-xl border border-white/8 bg-white/5 p-3 text-[11px] text-white/50">
          At {(quote.apy * 100).toFixed(2)}% APY, {formatNumber(inputAmount)} SOL
          earns ~{formatNumber(inputAmount * quote.apy, 4)} SOL per year.
        </div>
      )}
    </>
  );
}
