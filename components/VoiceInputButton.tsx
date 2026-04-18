"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { VoiceState } from "@/hooks/useVoiceInput";

interface VoiceInputButtonProps {
  state: VoiceState;
  isSupported: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export function VoiceInputButton({
  state,
  isSupported,
  onClick,
  disabled,
}: VoiceInputButtonProps) {
  const listening = state === "listening";
  const processing = state === "processing";
  const errored = state === "error";
  const buttonDisabled = !isSupported || disabled;

  const title = !isSupported
    ? "Voice input not supported in this browser"
    : listening
    ? "Stop listening"
    : "Speak your command";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={buttonDisabled}
      title={title}
      aria-label={title}
      aria-pressed={listening}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: buttonDisabled ? 1 : 1.04 }}
      className={cn(
        "relative shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border text-white/80 transition-colors",
        "border-white/10 bg-white/5 hover:bg-white/10",
        listening && "border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/20",
        errored && "border-rose-500/40 bg-rose-500/10 text-rose-300",
        processing && "border-indigo-400/40 bg-indigo-500/10 text-indigo-200",
        buttonDisabled && "cursor-not-allowed opacity-30 hover:bg-white/5"
      )}
    >
      {listening && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-xl border border-rose-400/60"
          animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.25, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {processing ? <Spinner /> : listening ? <StopIcon /> : <MicIcon />}
    </motion.button>
  );
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}
