import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export type RecipientValidation =
  | { ok: true; pubkey: PublicKey }
  | { ok: false; error: string };

export function validateRecipient(recipient: string): RecipientValidation {
  const trimmed = recipient.trim();
  if (!trimmed) {
    return { ok: false, error: "Recipient address is empty." };
  }
  if (trimmed.toLowerCase().endsWith(".sol")) {
    return {
      ok: false,
      error: "SOL domains aren't supported yet — use a raw wallet address.",
    };
  }
  try {
    return { ok: true, pubkey: new PublicKey(trimmed) };
  } catch {
    return { ok: false, error: "Invalid recipient address." };
  }
}

export interface BuildSolTransferArgs {
  connection: Connection;
  from: PublicKey;
  to: PublicKey;
  amountSol: number;
}

export interface BuiltSolTransfer {
  transaction: VersionedTransaction;
  feeLamports: number;
  lamports: number;
  blockhashInfo: { blockhash: string; lastValidBlockHeight: number };
}

const FALLBACK_FEE_LAMPORTS = 5000;

export async function buildSolTransferTx({
  connection,
  from,
  to,
  amountSol,
}: BuildSolTransferArgs): Promise<BuiltSolTransfer> {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  if (lamports <= 0) {
    throw new Error("Amount is too small.");
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
    "confirmed"
  );

  const instructions = [
    SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }),
  ];

  const messageV0 = new TransactionMessage({
    payerKey: from,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);

  let feeLamports = FALLBACK_FEE_LAMPORTS;
  try {
    const feeResponse = await connection.getFeeForMessage(messageV0, "confirmed");
    if (typeof feeResponse.value === "number") {
      feeLamports = feeResponse.value;
    }
  } catch {
    // keep fallback
  }

  return {
    transaction,
    feeLamports,
    lamports,
    blockhashInfo: { blockhash, lastValidBlockHeight },
  };
}

export function shortAddress(address: string, head = 4, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function deserializeSwapTx(base64: string): VersionedTransaction {
  const buf =
    typeof Buffer !== "undefined"
      ? Buffer.from(base64, "base64")
      : Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return VersionedTransaction.deserialize(buf);
}

// Marinade's SDK emits legacy Transactions that reference the program's
// address lookup table. We serialize and transport them unchanged so the
// LUT references survive the round-trip to the wallet adapter.
export function deserializeLegacyTx(base64: string): Transaction {
  const buf =
    typeof Buffer !== "undefined"
      ? Buffer.from(base64, "base64")
      : Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return Transaction.from(buf);
}
