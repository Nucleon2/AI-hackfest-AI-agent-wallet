import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  BN,
  Marinade,
  MarinadeConfig,
} from "@marinade.finance/marinade-ts-sdk";

export interface BuiltMarinadeTx {
  transaction: VersionedTransaction;
  blockhashInfo: { blockhash: string; lastValidBlockHeight: number };
  associatedMSolTokenAccount: string;
}

function makeMarinade(connection: Connection, owner: PublicKey): Marinade {
  const config = new MarinadeConfig({ connection, publicKey: owner });
  return new Marinade(config);
}

async function toVersionedTx(
  connection: Connection,
  payer: PublicKey,
  legacyTx: { instructions: { programId: PublicKey; keys: unknown; data: Buffer }[] }
): Promise<{ transaction: VersionedTransaction; blockhashInfo: { blockhash: string; lastValidBlockHeight: number } }> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
    "confirmed"
  );
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: legacyTx.instructions as never,
  }).compileToV0Message();
  return {
    transaction: new VersionedTransaction(message),
    blockhashInfo: { blockhash, lastValidBlockHeight },
  };
}

export async function buildMarinadeDepositTx(
  connection: Connection,
  owner: PublicKey,
  amountSol: number
): Promise<BuiltMarinadeTx> {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  const marinade = makeMarinade(connection, owner);
  const { transaction, associatedMSolTokenAccountAddress } = await marinade.deposit(
    new BN(lamports)
  );
  const { transaction: v0, blockhashInfo } = await toVersionedTx(
    connection,
    owner,
    transaction
  );
  return {
    transaction: v0,
    blockhashInfo,
    associatedMSolTokenAccount: associatedMSolTokenAccountAddress.toBase58(),
  };
}

export async function buildMarinadeLiquidUnstakeTx(
  connection: Connection,
  owner: PublicKey,
  amountMsol: number
): Promise<BuiltMarinadeTx> {
  if (!Number.isFinite(amountMsol) || amountMsol <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  const lamports = Math.round(amountMsol * LAMPORTS_PER_SOL);
  const marinade = makeMarinade(connection, owner);
  const { transaction, associatedMSolTokenAccountAddress } =
    await marinade.liquidUnstake(new BN(lamports));
  const { transaction: v0, blockhashInfo } = await toVersionedTx(
    connection,
    owner,
    transaction
  );
  return {
    transaction: v0,
    blockhashInfo,
    associatedMSolTokenAccount: associatedMSolTokenAccountAddress.toBase58(),
  };
}

export async function fetchMsolPrice(
  connection: Connection,
  owner: PublicKey
): Promise<number> {
  const marinade = makeMarinade(connection, owner);
  const state = await marinade.getMarinadeState();
  return state.mSolPrice;
}

const APY_CACHE_TTL_MS = 5 * 60 * 1000;
let apyCache: { value: number; fetchedAt: number } | null = null;

// The Marinade public stats endpoint returns `{ value: 0.068, ... }` where
// `value` is the decimal APY. Cached for 5 minutes to avoid hammering it.
export async function fetchMarinadeApy(): Promise<number> {
  const now = Date.now();
  if (apyCache && now - apyCache.fetchedAt < APY_CACHE_TTL_MS) {
    return apyCache.value;
  }
  try {
    const res = await fetch("https://api.marinade.finance/msol/apy/30d", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = (await res.json()) as { value?: number };
    if (typeof json.value === "number" && Number.isFinite(json.value)) {
      apyCache = { value: json.value, fetchedAt: now };
      return json.value;
    }
  } catch {
    // fall through to fallback
  }
  const fallback = 0.075;
  apyCache = { value: fallback, fetchedAt: now };
  return fallback;
}
