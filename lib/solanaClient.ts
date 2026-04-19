import { Connection, clusterApiUrl } from "@solana/web3.js";

export type SolanaNetwork = "devnet" | "mainnet-beta" | "testnet";

export const SOLANA_NETWORK: SolanaNetwork =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK as SolanaNetwork | undefined) ??
  "devnet";

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl("devnet");

export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

export function solscanUrl(signature: string): string {
  const base = `https://solscan.io/tx/${signature}`;
  if (SOLANA_NETWORK === "mainnet-beta") return base;
  return `${base}?cluster=${SOLANA_NETWORK}`;
}

export function networkLabel(): string {
  if (SOLANA_NETWORK === "mainnet-beta") return "Mainnet";
  if (SOLANA_NETWORK === "testnet") return "Testnet";
  return "Devnet";
}
