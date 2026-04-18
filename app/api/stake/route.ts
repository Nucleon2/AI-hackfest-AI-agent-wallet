import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { connection, SOLANA_NETWORK } from "@/lib/solanaClient";
import {
  buildMarinadeDepositTx,
  buildMarinadeLiquidUnstakeTx,
  fetchMarinadeApy,
  fetchMsolPrice,
} from "@/lib/marinadeClient";

export const runtime = "nodejs";

type StakeAction = "stake" | "unstake";
type Provider = "marinade" | "jito";

interface RequestBody {
  action?: unknown;
  amount?: unknown;
  provider?: unknown;
  userPublicKey?: unknown;
  preview?: unknown;
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
    const [apy, mSolPrice] = await Promise.all([
      fetchMarinadeApy(),
      fetchMsolPrice(connection, owner),
    ]);

    if (preview) {
      const outputAmount =
        action === "stake" ? amount / mSolPrice : amount * mSolPrice * 0.997;
      return NextResponse.json({
        success: true,
        data: {
          display: {
            action,
            provider,
            inputAmount: amount,
            outputAmount,
            mSolPrice,
            apy,
            feePct: action === "unstake" ? 0.3 : 0,
          },
        },
      });
    }

    const built =
      action === "stake"
        ? await buildMarinadeDepositTx(connection, owner, amount)
        : await buildMarinadeLiquidUnstakeTx(connection, owner, amount);

    const serialized = Buffer.from(built.transaction.serialize()).toString("base64");
    const outputAmount =
      action === "stake" ? amount / mSolPrice : amount * mSolPrice * 0.997;

    return NextResponse.json({
      success: true,
      data: {
        stakeTransaction: serialized,
        lastValidBlockHeight: built.blockhashInfo.lastValidBlockHeight,
        display: {
          action,
          provider,
          inputAmount: amount,
          outputAmount,
          mSolPrice,
          apy,
          feePct: action === "unstake" ? 0.3 : 0,
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Marinade request failed.";
    return fail(502, msg);
  }
}
