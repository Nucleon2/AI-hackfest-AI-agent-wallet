import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { connection, SOLANA_NETWORK } from "@/lib/solanaClient";
import {
  buildMarinadeDepositTx,
  buildMarinadeLiquidUnstakeTx,
  fetchMarinadeApy,
  fetchMsolPrice,
  fetchUnstakeFeePct,
} from "@/lib/marinadeClient";

export const runtime = "nodejs";

type StakeAction = "stake" | "unstake";
type Provider = "marinade" | "jito";

// Cap at 1000 SOL/mSOL per request. Prevents malformed requests from
// constructing a BN the SDK can't handle and nudges any UI bug that
// forwards an unchecked value.
const MAX_AMOUNT = 1000;

interface RequestBody {
  action?: unknown;
  amount?: unknown;
  provider?: unknown;
  userPublicKey?: unknown;
  preview?: unknown;
}

interface DisplayPayload {
  action: StakeAction;
  provider: Provider;
  inputAmount: number;
  outputAmount: number;
  mSolPrice: number;
  apy: number;
  feePct: number;
}

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

function asAction(v: unknown): StakeAction | null {
  return v === "stake" || v === "unstake" ? v : null;
}

function asProvider(v: unknown): Provider | null {
  return v === "marinade" || v === "jito" ? v : null;
}

function buildDisplay(args: {
  action: StakeAction;
  provider: Provider;
  inputAmount: number;
  mSolPrice: number;
  apy: number;
  feePct: number;
}): DisplayPayload {
  const { action, inputAmount, mSolPrice, feePct } = args;
  const outputAmount =
    action === "stake"
      ? inputAmount / mSolPrice
      : inputAmount * mSolPrice * (1 - feePct / 100);
  return { ...args, outputAmount };
}

export async function POST(req: NextRequest) {
  if (SOLANA_NETWORK !== "mainnet-beta") {
    return fail(
      400,
      `Staking requires mainnet-beta — current network is ${SOLANA_NETWORK}.`
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const action = asAction(body.action);
  const provider = asProvider(body.provider);
  const amount = typeof body.amount === "number" && body.amount > 0 ? body.amount : null;
  const userPublicKey =
    typeof body.userPublicKey === "string" && body.userPublicKey.trim().length > 0
      ? body.userPublicKey.trim()
      : null;
  const preview = body.preview === true;

  if (!action) return fail(400, "action must be \"stake\" or \"unstake\".");
  if (!provider) return fail(400, "provider must be \"marinade\" or \"jito\".");
  if (amount === null) return fail(400, "amount must be a positive number.");
  if (amount > MAX_AMOUNT) {
    return fail(400, `amount exceeds the ${MAX_AMOUNT} per-request cap.`);
  }
  if (!userPublicKey) return fail(400, "userPublicKey is required.");

  if (provider === "jito") {
    return fail(
      501,
      "Jito staking coming soon — please use Marinade for now."
    );
  }

  let owner: PublicKey;
  try {
    owner = new PublicKey(userPublicKey);
  } catch {
    return fail(400, "Invalid userPublicKey.");
  }

  try {
    const [apy, mSolPrice, feePct] = await Promise.all([
      fetchMarinadeApy(),
      fetchMsolPrice(connection, owner),
      action === "unstake"
        ? fetchUnstakeFeePct(connection, owner, amount)
        : Promise.resolve(0),
    ]);

    const display = buildDisplay({
      action,
      provider,
      inputAmount: amount,
      mSolPrice,
      apy,
      feePct,
    });

    if (preview) {
      return NextResponse.json({ success: true, data: { display } });
    }

    const built =
      action === "stake"
        ? await buildMarinadeDepositTx(connection, owner, amount)
        : await buildMarinadeLiquidUnstakeTx(connection, owner, amount);

    const serialized = built.transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64");

    return NextResponse.json({
      success: true,
      data: {
        stakeTransaction: serialized,
        lastValidBlockHeight: built.blockhashInfo.lastValidBlockHeight,
        display,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Marinade request failed.";
    return fail(502, msg);
  }
}
