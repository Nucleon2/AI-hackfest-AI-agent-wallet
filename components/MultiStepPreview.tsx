"use client";

import { useEffect } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BorderBeam } from "@/components/ui/border-beam";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import type { SwapQuoteDisplay } from "@/components/TransactionPreview";
import type { MultiStepIntent, MultiStepStep } from "@/types/intent";
import { shortAddress } from "@/lib/transactionBuilder";
import { cn } from "@/lib/utils";

export type StepRunStatus =
  | "pending"
  | "building"
  | "ready"
  | "signing"
  | "confirming"
  | "done"
  | "error";

export interface MultiStepPreviewProps {
  intent: MultiStepIntent;
  statuses: StepRunStatus[];
  currentIndex: number;
  errorMessage: string | null;
  swapQuote: SwapQuoteDisplay | null;
  sendFeeLamports: number | null;
  resolvedRecipient: string | null;
  onConfirmStep: () => void;
  onCancel: () => void;
}

const CONFIRM_LABELS: Record<StepRunStatus, string> = {
  pending: "Waiting…",
  building: "Preparing…",
  ready: "Confirm",
  signing: "Waiting for wallet…",
  confirming: "Confirming on chain…",
  done: "Next step loading…",
  error: "Failed",
};

function StepStatusIcon({ status }: { status: StepRunStatus }) {
  if (status === "done") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-emerald-400">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-red-400">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "building" || status === "signing" || status === "confirming") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-indigo-300 animate-spin">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="20 40" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "ready") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-indigo-400">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/25">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function stepSummary(step: MultiStepStep): string {
  if (step.type === "swap") {
    return `Swap ${step.amount} ${step.fromToken} → ${step.toToken}`;
  }
  if (step.type === "history") {
    return `Show last ${step.limit ?? 5} transactions`;
  }
  if (step.type === "balance") {
    return "Show wallet balance";
  }
  const amt = step.amount !== null ? String(step.amount) : "(swap output)";
  const recip = step.recipient
    ? step.recipient.length > 20
      ? shortAddress(step.recipient, 4, 4)
      : step.recipient
    : "(unknown recipient)";
  return `Send ${amt} ${step.token} → ${recip}`;
}

function SwapStepDetail({ quote, step }: { quote: SwapQuoteDisplay | null; step: MultiStepStep }) {
  if (step.type !== "swap") return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
        <div className="text-white/40 uppercase tracking-wider text-[10px]">You pay</div>
        <div className="mt-0.5 text-white/80 font-medium">
          {step.amount} {step.fromToken}
        </div>
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
        <div className="text-white/40 uppercase tracking-wider text-[10px]">You receive (est.)</div>
        <div className="mt-0.5 text-white/80 font-medium">
          {quote ? `~${quote.outUiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${quote.toSymbol}` : "—"}
        </div>
      </div>
      {quote && (
        <>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
            <div className="text-white/40 uppercase tracking-wider text-[10px]">Price impact</div>
            <div className={cn("mt-0.5 font-medium", quote.priceImpactPct >= 1 ? "text-red-300" : quote.priceImpactPct >= 0.3 ? "text-amber-300" : "text-white/80")}>
              {quote.priceImpactPct < 0.01 ? "< 0.01%" : `${quote.priceImpactPct.toFixed(2)}%`}
            </div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
            <div className="text-white/40 uppercase tracking-wider text-[10px]">Route</div>
            <div className="mt-0.5 text-white/80 truncate">
              {quote.routeLabels?.join(" → ") ?? "—"}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SendStepDetail({
  feeLamports,
  resolvedRecipient,
  step,
}: {
  feeLamports: number | null;
  resolvedRecipient: string | null;
  step: MultiStepStep;
}) {
  if (step.type !== "send") return null;
  const feeSol = feeLamports !== null ? (feeLamports / LAMPORTS_PER_SOL).toFixed(6) : null;
  const displayAddr = resolvedRecipient ?? step.recipient ?? "(unknown recipient)";
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
        <div className="text-white/40 uppercase tracking-wider text-[10px]">Recipient</div>
        <div className="mt-0.5 font-mono text-white/80 truncate" title={displayAddr}>
          {displayAddr.length > 20 ? shortAddress(displayAddr, 5, 5) : displayAddr}
        </div>
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
        <div className="text-white/40 uppercase tracking-wider text-[10px]">Network fee</div>
        <div className="mt-0.5 text-white/80">{feeSol ? `~${feeSol} SOL` : "—"}</div>
      </div>
    </div>
  );
}

export function MultiStepPreview({
  intent,
  statuses,
  currentIndex,
  errorMessage,
  swapQuote,
  sendFeeLamports,
  resolvedRecipient,
  onConfirmStep,
  onCancel,
}: MultiStepPreviewProps) {
  const activeStatus = statuses[currentIndex] ?? "pending";
  const isBusy = activeStatus === "signing" || activeStatus === "confirming";
  const canConfirm = activeStatus === "ready";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isBusy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, isBusy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Multi-step transaction"
    >
      <button
        type="button"
        aria-label="Close"
        disabled={isBusy}
        onClick={onCancel}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm disabled:cursor-not-allowed"
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b14]/95 p-6 shadow-2xl backdrop-blur-xl">
        <BorderBeam size={110} duration={6} colorFrom="#6366f1" colorTo="#a78bfa" borderWidth={1} />

        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-white/80 uppercase">Multi-Step</h2>
              <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-300 uppercase tracking-wider">
                {currentIndex + 1} of {intent.steps.length}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/40 leading-relaxed">{intent.description}</p>
          </div>
        </div>

        {/* Step list */}
        <div className="space-y-2">
          {intent.steps.map((step, i) => {
            const status = statuses[i] ?? "pending";
            const isActive = i === currentIndex;
            const isDone = status === "done";
            const isError = status === "error";

            return (
              <div
                key={i}
                className={cn(
                  "rounded-xl border p-3 transition-all",
                  isDone
                    ? "border-emerald-400/20 bg-emerald-500/5"
                    : isError
                      ? "border-red-500/30 bg-red-500/5"
                      : isActive
                        ? "border-indigo-500/40 bg-indigo-500/5 ring-1 ring-indigo-500/20"
                        : "border-white/[0.07] bg-white/[0.02] opacity-50"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <StepStatusIcon status={status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-white/30">
                        Step {i + 1}
                      </span>
                      <span className={cn(
                        "text-[10px] uppercase tracking-wider",
                        step.type === "swap" ? "text-violet-400/70" :
                        step.type === "history" || step.type === "balance" ? "text-sky-400/70" :
                        "text-indigo-400/70"
                      )}>
                        {step.type}
                      </span>
                    </div>
                    <p className={cn(
                      "mt-0.5 text-xs font-medium truncate",
                      isDone ? "text-emerald-300/80" : isActive ? "text-white/90" : "text-white/50"
                    )}>
                      {stepSummary(step)}
                    </p>
                  </div>
                  {isDone && (
                    <span className="shrink-0 text-[10px] text-emerald-400/60 uppercase tracking-wider">Done</span>
                  )}
                </div>

                {/* Expanded detail for active step */}
                {isActive && step.type === "swap" && (
                  <SwapStepDetail quote={swapQuote} step={step} />
                )}
                {isActive && step.type === "send" && (
                  <SendStepDetail
                    feeLamports={sendFeeLamports}
                    resolvedRecipient={resolvedRecipient}
                    step={step}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {errorMessage}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <ShimmerButton
            onClick={onConfirmStep}
            disabled={!canConfirm}
            shimmerColor="#a5b4fc"
            background="rgba(99, 102, 241, 0.2)"
            borderRadius="12px"
            className="flex-1 border-indigo-500/30 disabled:opacity-40"
          >
            <span className="text-sm text-white">
              {canConfirm
                ? `Confirm Step ${currentIndex + 1} of ${intent.steps.length}`
                : CONFIRM_LABELS[activeStatus]}
            </span>
          </ShimmerButton>
        </div>
      </div>
    </div>
  );
}
