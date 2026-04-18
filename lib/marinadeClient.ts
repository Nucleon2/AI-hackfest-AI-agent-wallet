import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  BN,
  Marinade,
  MarinadeConfig,
} from "@marinade.finance/marinade-ts-sdk";

// mSOL uses 9 decimals — same base-unit scale as SOL lamports — so
// LAMPORTS_PER_SOL works for both SOL→lamports and mSOL→raw conversions.
const MARINADE_BASE_UNITS = 1_000_000_000;

export interface BuiltMarinadeTx {
  transaction: Transaction;
  blockhashInfo: { blockhash: string; lastValidBlockHeight: number };
  associatedMSolTokenAccount: string;
}

function makeMarinade(connection: Connection, owner: PublicKey): Marinade {
  const config = new MarinadeConfig({ connection, publicKey: owner });
  return new Marinade(config);
}

// Marinade's SDK returns a legacy Transaction whose instructions reference
// the Marinade program's address lookup table. Repacking the instructions
// into a v0 message without the LUT produced transactions that failed
// simulation, so we preserve the original legacy Transaction and attach a
// fresh blockhash + fee payer — the wallet adapter's sendTransaction
// accepts legacy Transactions directly.
async function finalizeTx(
  connection: Connection,
  payer: PublicKey,
  tx: Transaction
): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
    "confirmed"
  );
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  return { blockhash, lastValidBlockHeight };
}

export async function buildMarinadeDepositTx(
  connection: Connection,
  owner: PublicKey,
  amountSol: number
): Promise<BuiltMarinadeTx> {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  const lamports = Math.round(amountSol * MARINADE_BASE_UNITS);
  const marinade = makeMarinade(connection, owner);
  const { transaction, associatedMSolTokenAccountAddress } = await marinade.deposit(
    new BN(lamports)
  );
  const blockhashInfo = await finalizeTx(connection, owner, transaction);
  return {
    transaction,
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
  const lamports = Math.round(amountMsol * MARINADE_BASE_UNITS);
  const marinade = makeMarinade(connection, owner);
  const { transaction, associatedMSolTokenAccountAddress } =
    await marinade.liquidUnstake(new BN(lamports));
  const blockhashInfo = await finalizeTx(connection, owner, transaction);
  return {
    transaction,
    blockhashInfo,
    associatedMSolTokenAccount: associatedMSolTokenAccountAddress.toBase58(),
  };
}

// Query the real liquid-unstake fee (basis points) for a specific unstake
// amount. The fee scales with pool utilization — hardcoded 30bp was
// inaccurate during high-drain periods.
export async function fetchUnstakeFeePct(
  connection: Connection,
  owner: PublicKey,
  amountMsol: number
): Promise<number> {
  const marinade = makeMarinade(connection, owner);
  const state = await marinade.getMarinadeState();
  const lamports = Math.round(amountMsol * MARINADE_BASE_UNITS);
  // Convert mSOL lamports → target SOL lamports using the price (the SDK's
  // unstakeNowFeeBp expects lamports-to-obtain, i.e. the output SOL side).
  const solLamports = Math.round(lamports * state.mSolPrice);
  const feeBp = await state.unstakeNowFeeBp(new BN(solLamports));
  return feeBp / 100; // basis points → percent
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
