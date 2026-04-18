import { create } from "zustand";

// Single source of truth for counts displayed in the Sidebar. useDCAManager
// (mounted inside ChatInterface) writes to this store on every refresh so
// the Sidebar can read from it without starting its own polling loop.
interface DCAStore {
  dcaCount: number;
  alertCount: number;
  setCounts: (dca: number, alert: number) => void;
  reset: () => void;
}

export const useDCAStore = create<DCAStore>()((set) => ({
  dcaCount: 0,
  alertCount: 0,
  setCounts: (dca, alert) => set({ dcaCount: dca, alertCount: alert }),
  reset: () => set({ dcaCount: 0, alertCount: 0 }),
}));
