"use client";

import { useEffect } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { SendIntent } from "@/types/intent";
import { BorderBeam } from "@/components/ui/border-beam";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { shortAddress } from "@/lib/transactionBuilder";
import { cn } from "@/lib/utils";

export type PreviewStatus =
  | "building"
  | "ready"
  | "signing"
  | "sending"
  | "confirming"
  | "error";

interface TransactionPreviewProps {
  intent: SendIntent;
  status: PreviewStatus;
  errorMessage?: string | null;
  feeLamports?: number | null;
  recipientPubkey?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const STATUS_LABEL: Record<PreviewStatus, string> = {
  building: "Preparing transaction…",
  ready: "Confirm",
  signing: "Waiting for wallet…",
  sending: "Broadcasting…",
  confirming: "Confirming on chain…",
  error: "Confirm",
};

export function TransactionPreview({
  intent,
  status,
  errorMessage,
  feeLamports,
  recipientPubkey,
  onConfirm,
  onCancel,
}: TransactionPreviewProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && status !== "sending" && status !== "confirming") {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, status]);

  const displayRecipient = recipientPubkey ?? intent.recipient;
  const feeSol =
    typeof feeLamports === "number" ? feeLamports / LAMPORTS_PER_SOL : null;
  const hasError = Boolean(errorMessage);
  const isBusy =
    status === "signing" || status === "sending" || status === "confirming";
  const canConfirm = status === "ready" && !hasError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm transaction"
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
            Confirm send
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

        <div className="space-y-3">
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
            <span className="text-sm text-white">{STATUS_LABEL[status]}</span>
          </ShimmerButton>
        </div>
      </div>
    </div>
  );
}
