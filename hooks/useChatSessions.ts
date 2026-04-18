"use client";

import { useCallback, useEffect } from "react";
import { useChatSessionStore } from "@/lib/stores/chatSessionStore";
import type { ChatSessionRow } from "@/lib/db";

export function useChatSessions(walletPubkey: string | null) {
  const {
    sessions,
    setSessions,
    addSession,
    removeSession,
    updateSessionTitle,
    setActiveSessionId,
    activeSessionId,
  } = useChatSessionStore();

  const loadSessions = useCallback(async () => {
    if (!walletPubkey) { setSessions([]); return; }
    try {
      const res = await fetch(`/api/chat-sessions?wallet=${walletPubkey}`);
      const json = (await res.json()) as { success: boolean; data?: ChatSessionRow[] };
      if (json.success && json.data) setSessions(json.data);
    } catch {
      // non-fatal
    }
  }, [walletPubkey, setSessions]);

  const createSession = useCallback(async (): Promise<string | null> => {
    if (!walletPubkey) return null;
    try {
      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey }),
      });
      const json = (await res.json()) as { success: boolean; data?: ChatSessionRow };
      if (json.success && json.data) {
        addSession(json.data);
        setActiveSessionId(json.data.id);
        return json.data.id;
      }
    } catch {
      // non-fatal
    }
    return null;
  }, [walletPubkey, addSession, setActiveSessionId]);

  const deleteSession = useCallback(async (id: string) => {
    if (!walletPubkey) return;
    try {
      await fetch(`/api/chat-sessions/${id}?wallet=${walletPubkey}`, { method: "DELETE" });
      removeSession(id);
      // If the deleted session was active, switch to most recent or create new
      if (activeSessionId === id) {
        const remaining = useChatSessionStore.getState().sessions;
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
        } else {
          setActiveSessionId(null);
        }
      }
    } catch {
      // non-fatal
    }
  }, [walletPubkey, activeSessionId, removeSession, setActiveSessionId]);

  const renameSession = useCallback(async (id: string, title: string) => {
    try {
      await fetch(`/api/chat-sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      updateSessionTitle(id, title);
    } catch {
      // non-fatal
    }
  }, [updateSessionTitle]);

  useEffect(() => {
    if (!walletPubkey) {
      setSessions([]);
      setActiveSessionId(null);
      return;
    }
    loadSessions();
  }, [walletPubkey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { sessions, loadSessions, createSession, deleteSession, renameSession };
}
