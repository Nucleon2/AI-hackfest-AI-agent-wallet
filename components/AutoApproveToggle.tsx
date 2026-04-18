"use client";

import { cn } from "@/lib/utils";

interface Props {
  autoApprove: boolean;
  onToggle: () => void;
}

export function AutoApproveToggle({ autoApprove, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      title={
        autoApprove
          ? "Auto-approve is ON — transactions execute without confirmation. Click to switch to manual."
          : "Manual mode — you confirm every transaction. Click to enable auto-approve."
      }
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all",
        autoApprove
          ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
          : "border-white/10 bg-white/[0.03] text-white/40 hover:border-white/20 hover:text-white/60"
      )}
    >
      {autoApprove ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
          Auto-approve
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Manual
        </>
      )}
    </button>
  );
}
