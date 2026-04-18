"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "wallet_auto_approve";

export function useAutoApprove() {
  const [autoApprove, setAutoApproveState] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "true") {
      setAutoApproveState(true);
    }
  }, []);

  const toggle = useCallback(() => {
    setAutoApproveState((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { autoApprove, toggle };
}
