"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type TransactionStatus = "idle" | "processing" | "confirmed" | "error";

interface TransactionStatusContextValue {
  status: TransactionStatus;
  setStatus: (status: TransactionStatus) => void;
}

const TransactionStatusContext = createContext<TransactionStatusContextValue | null>(
  null
);

export function TransactionStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatusRaw] = useState<TransactionStatus>("idle");

  const setStatus = useCallback((next: TransactionStatus) => {
    setStatusRaw(next);
  }, []);

  const value = useMemo(() => ({ status, setStatus }), [status, setStatus]);

  return (
    <TransactionStatusContext.Provider value={value}>
      {children}
    </TransactionStatusContext.Provider>
  );
}

export function useTransactionStatus(): TransactionStatusContextValue {
  const ctx = useContext(TransactionStatusContext);
  if (!ctx) {
    return { status: "idle", setStatus: () => {} };
  }
  return ctx;
}
