import { create } from "zustand";
import type { ChatSessionRow } from "@/lib/db";

interface ChatSessionStore {
  activeSessionId: string | null;
  sessions: ChatSessionRow[];
  setActiveSessionId: (id: string | null) => void;
  setSessions: (sessions: ChatSessionRow[]) => void;
  addSession: (session: ChatSessionRow) => void;
  removeSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  bumpSession: (id: string, updated_at: number) => void;
}

export const useChatSessionStore = create<ChatSessionStore>()((set) => ({
  activeSessionId: null,
  sessions: [],
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((s) => ({ sessions: [session, ...s.sessions] })),
  removeSession: (id) =>
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
  updateSessionTitle: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)),
    })),
  bumpSession: (id, updated_at) =>
    set((s) => ({
      sessions: s.sessions
        .map((x) => (x.id === id ? { ...x, updated_at } : x))
        .sort((a, b) => b.updated_at - a.updated_at),
    })),
}));

export const setChatSessionState = {
  setActiveSessionId: (id: string | null) =>
    useChatSessionStore.getState().setActiveSessionId(id),
};
