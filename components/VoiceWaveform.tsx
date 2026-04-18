"use client";

import { AnimatePresence, motion } from "motion/react";

interface VoiceWaveformProps {
  visible: boolean;
  label?: string;
}

const BAR_COUNT = 5;
const BAR_DELAYS = [0, 0.12, 0.24, 0.18, 0.06];

export function VoiceWaveform({ visible, label }: VoiceWaveformProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="voice-waveform"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="pointer-events-none absolute left-1/2 bottom-full z-10 mb-2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white/75 shadow-lg shadow-black/40 backdrop-blur-xl"
        >
          <div className="flex h-4 items-center gap-[3px]">
            {Array.from({ length: BAR_COUNT }).map((_, i) => (
              <motion.span
                key={i}
                className="block w-[3px] rounded-full bg-rose-300/90"
                style={{ height: "100%", transformOrigin: "center" }}
                animate={{ scaleY: [0.3, 1, 0.5, 0.9, 0.3] }}
                transition={{
                  duration: 0.9,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: BAR_DELAYS[i] ?? 0,
                }}
              />
            ))}
          </div>
          <span className="font-medium tracking-wide">
            {label ?? "Listening…"}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
