import { NextRequest, NextResponse } from "next/server";
import { getSwapTransaction, type JupiterQuote } from "@/lib/jupiterClient";
import { SOLANA_NETWORK } from "@/lib/solanaClient";

export const runtime = "nodejs";

interface RequestBody {
  quote?: unknown;
  userPublicKey?: unknown;
}

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

function isQuote(value: unknown): value is JupiterQuote {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.inputMint === "string" &&
    typeof v.outputMint === "string" &&
    typeof v.inAmount === "string" &&
    typeof v.outAmount === "string" &&
    typeof v.otherAmountThreshold === "string" &&
    typeof v.priceImpactPct === "string" &&
    typeof v.slippageBps === "number" &&
    typeof v.swapMode === "string" &&
    Array.isArray(v.routePlan)
  );
}

export async function POST(req: NextRequest) {
  if (SOLANA_NETWORK !== "mainnet-beta") {
    return fail(
      400,
      `Swaps require mainnet-beta — current network is ${SOLANA_NETWORK}.`
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  if (!isQuote(body.quote)) return fail(400, "Missing or invalid quote.");
  if (typeof body.userPublicKey !== "string" || !body.userPublicKey.trim()) {
    return fail(400, "userPublicKey is required.");
  }

  try {
    const swap = await getSwapTransaction({
      quote: body.quote,
      userPublicKey: body.userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    });
    return NextResponse.json({
      success: true,
      data: {
        swapTransaction: swap.swapTransaction,
        lastValidBlockHeight: swap.lastValidBlockHeight,
        prioritizationFeeLamports: swap.prioritizationFeeLamports ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Jupiter request failed.";
    return fail(502, msg);
  }
}
