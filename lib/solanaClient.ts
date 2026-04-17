import { Connection, clusterApiUrl } from "@solana/web3.js";

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl("devnet");

export const connection = new Connection(SOLANA_RPC_URL, "confirmed");
