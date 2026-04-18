import { create } from "zustand";

export type OrbState = "idle" | "processing" | "confirmed" | "error" | "scanning";

interface OrbStore {
  state: OrbState;
  setOrbState: (next: OrbState) => void;
}

export const useOrbStore = create<OrbStore>()((set) => ({
  state: "idle",
  setOrbState: (next) => set({ state: next }),
}));

export const setOrbState = (next: OrbState) =>
  useOrbStore.getState().setOrbState(next);
