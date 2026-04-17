"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function useWalletBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    connection
      .getBalance(publicKey)
      .then((lamports) => {
        if (!cancelled) setBalance(lamports / LAMPORTS_PER_SOL);
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const subscriptionId = connection.onAccountChange(publicKey, (account) => {
      setBalance(account.lamports / LAMPORTS_PER_SOL);
    });

    return () => {
      cancelled = true;
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [connection, publicKey]);

  return { balance, loading };
}
