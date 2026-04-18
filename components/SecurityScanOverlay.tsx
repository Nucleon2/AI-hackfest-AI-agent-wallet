"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { TxAnalysis } from "@/app/api/analyze-transaction/route";

interface SecurityScanOverlayProps {
  visible: boolean;
  analysis: TxAnalysis | null;
}

const RISK_STYLES = {
  safe: {
    badge: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
    dot: "bg-emerald-400",
    label: "Safe",
  },
  caution: {
    badge: "bg-amber-500/15 border-amber-500/30 text-amber-300",
    dot: "bg-amber-400",
    label: "Caution",
  },
  danger: {
    badge: "bg-red-500/15 border-red-500/30 text-red-300",
    dot: "bg-red-400",
    label: "Danger",
  },
};

export function SecurityScanOverlay({ visible, analysis }: SecurityScanOverlayProps) {
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (analysis && !visible) {
      setShowResult(true);
      const t = setTimeout(() => setShowResult(false), 1400);
      return () => clearTimeout(t);
    }
  }, [analysis, visible]);

  // Reset when a new scan starts
  useEffect(() => {
    if (visible) setShowResult(false);
  }, [visible]);

  const isPresent = visible || showResult;
  const riskStyle = analysis ? RISK_STYLES[analysis.riskLevel] : null;

  return (
    <AnimatePresence>
      {isPresent && (
        <motion.div
          key="security-scan-overlay"
          data-testid="security-scan-overlay"
          className="pointer-events-none fixed inset-0 z-[15] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-[#020408]/50 backdrop-blur-[2px]" />

          {/* Scan line — only while actively scanning */}
          {visible && !analysis && (
            <motion.div
              className="absolute inset-x-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.1) 15%, rgba(34,211,238,0.9) 50%, rgba(6,182,212,0.1) 85%, transparent 100%)",
                boxShadow: "0 0 8px #06b6d4",
              }}
              initial={{ top: "0%" }}
              animate={{ top: "100%" }}
              transition={{ duration: 2.2, ease: "linear", repeat: Infinity, repeatType: "loop" }}
            />
          )}

          {/* HUD Panel */}
          <motion.div
            className="relative z-10 w-full max-w-[280px] rounded-2xl border border-cyan-500/20 bg-[#030b12]/85 p-5 backdrop-blur-xl"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* Corner brackets */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-3 top-3 h-3 w-3 border-l border-t border-cyan-500/40" />
              <div className="absolute right-3 top-3 h-3 w-3 border-r border-t border-cyan-500/40" />
              <div className="absolute bottom-3 left-3 h-3 w-3 border-b border-l border-cyan-500/40" />
              <div className="absolute bottom-3 right-3 h-3 w-3 border-b border-r border-cyan-500/40" />
            </div>

            {/* Header */}
            <div className="mb-4 flex items-center gap-2">
              <ShieldIcon />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/80">
                AI Security Scan
              </span>
              {visible && !analysis && (
                <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
              )}
              {analysis && riskStyle && (
                <span className={`ml-auto h-1.5 w-1.5 rounded-full ${riskStyle.dot}`} />
              )}
            </div>

            {/* Scanning state */}
            {visible && !analysis && (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="h-8 w-8 animate-spin rounded-full border border-white/10 border-t-cyan-400" />
                <span className="text-[10px] text-cyan-400/50">Analyzing transaction…</span>
              </div>
            )}

            {/* Result state */}
            {analysis && riskStyle && (showResult || visible) && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                {/* Risk badge */}
                <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${riskStyle.badge}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      {riskStyle.label}
                    </span>
                    <span className="text-[10px] opacity-60">
                      {analysis.action}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-bold opacity-70">
                    {analysis.riskScore}
                  </span>
                </div>

                {/* Summary */}
                <p className="text-[11px] leading-relaxed text-white/60">{analysis.summary}</p>

                {/* Warnings */}
                {analysis.warnings.length > 0 && (
                  <ul className="space-y-1.5">
                    {analysis.warnings.map((w, i) => (
                      <li
                        key={i}
                        className={`flex items-start gap-1.5 text-[11px] ${riskStyle.badge.split(" ").find((c) => c.startsWith("text-")) ?? "text-white/60"}`}
                      >
                        <span className="mt-px shrink-0">⚠</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Safe verification */}
                {analysis.riskLevel === "safe" && (
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
                    <span>✓</span>
                    <span>Verified by AI Guard</span>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ShieldIcon() {
  return (
    <svg width="12" height="13" viewBox="0 0 24 26" fill="none" className="shrink-0">
      <path
        d="M12 2L3 6.5V13C3 17.97 7.02 22.65 12 24C16.98 22.65 21 17.97 21 13V6.5L12 2Z"
        stroke="#22d3ee"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeOpacity={0.8}
      />
      <path
        d="M8.5 13L10.5 15L15.5 10"
        stroke="#22d3ee"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.8}
      />
    </svg>
  );
}
