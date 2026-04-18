import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { connection, SOLANA_NETWORK } from "@/lib/solanaClient";
import { MSOL_MINT, JITOSOL_MINT } from "@/lib/tokenRegistry";
import { fetchMarinadeApy, fetchMsolPrice } from "@/lib/marinadeClient";

export const runtime = "nodejs";

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

async function sumTokenBalance(owner: PublicKey, mint: string): Promise<number> {
  // TokenAccountsFilter is a discriminated union of `{ mint }` or
  // `{ programId }` — specifying mint alone already scopes to that
  // mint's SPL token program.
  const res = await connection.getParsedTokenAccountsByOwner(owner, {
    mint: new PublicKey(mint),
  });
  return res.value.reduce((acc, { account }) => {
    const amt = account.data.parsed?.info?.tokenAmount?.uiAmount;
    return acc + (typeof amt === "number" ? amt : 0);
  }, 0);
}

export async function GET(req: NextRequest) {
  if (SOLANA_NETWORK !== "mainnet-beta") {
    return fail(
      400,
      `Staking requires mainnet-beta — current network is ${SOLANA_NETWORK}.`
    );
  }

  const walletParam = req.nextUrl.searchParams.get("wallet");
  if (!walletParam) return fail(400, "wallet query parameter is required.");

  let owner: PublicKey;
  try {
    owner = new PublicKey(walletParam);
  } catch {
    return fail(400, "Invalid wallet address.");
  }

  try {
    const [msolBalance, jitoBalance, apy, mSolPrice] = await Promise.all([
      sumTokenBalance(owner, MSOL_MINT),
      sumTokenBalance(owner, JITOSOL_MINT),
      fetchMarinadeApy(),
      fetchMsolPrice(connection, owner),
    ]);

    const stakedSol = msolBalance * mSolPrice;
    const estimatedYieldSolPerYear = stakedSol * apy;

    return NextResponse.json({
      success: true,
      data: {
        msolBalance,
        jitoBalance,
        apy,
        jitoApy: 0.08,
        mSolPrice,
        stakedSol,
        estimatedYieldSolPerYear,
        estimatedDailyYieldSol: estimatedYieldSolPerYear / 365,
        estimatedMonthlyYieldSol: (estimatedYieldSolPerYear * 30) / 365,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load staking status.";
    return fail(502, msg);
  }
}
