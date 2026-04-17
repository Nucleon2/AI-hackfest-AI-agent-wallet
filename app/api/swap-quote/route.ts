import { NextRequest, NextResponse } from "next/server";
import { getQuote, type JupiterQuote } from "@/lib/jupiterClient";
import { SOLANA_NETWORK } from "@/lib/solanaClient";
import {
  fromBaseUnits,
  getToken,
  toBaseUnits,
  type TokenInfo,
} from "@/lib/tokenRegistry";

export const runtime = "nodejs";

export interface SwapQuoteDisplay {
  fromSymbol: string;
  toSymbol: string;
  inUiAmount: number;
  outUiAmount: number;
  rate: number;
  priceImpactPct: number;
  slippageBps: number;
  routeLabels: string[];
  otherAmountThresholdUi: number;
}

interface RequestBody {
  fromToken?: unknown;
  toToken?: unknown;
  amount?: unknown;
  slippageBps?: unknown;
}

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

function buildDisplay(
  quote: JupiterQuote,
  input: TokenInfo,
  output: TokenInfo
): SwapQuoteDisplay {
  const inUi = fromBaseUnits(quote.inAmount, input.decimals);
  const outUi = fromBaseUnits(quote.outAmount, output.decimals);
  const thresholdUi = fromBaseUnits(
    quote.otherAmountThreshold,
    output.decimals
  );
  const parsedImpact = Number.parseFloat(quote.priceImpactPct);
  const priceImpactPct = Number.isFinite(parsedImpact)
    ? Math.abs(parsedImpact) * 100
    : 0;
  const routeLabels = quote.routePlan
    .map((step) => step.swapInfo.label)
    .filter((label): label is string => Boolean(label));

  return {
    fromSymbol: input.symbol,
    toSymbol: output.symbol,
    inUiAmount: inUi,
    outUiAmount: outUi,
    rate: inUi > 0 ? outUi / inUi : 0,
    priceImpactPct,
    slippageBps: quote.slippageBps,
    routeLabels,
    otherAmountThresholdUi: thresholdUi,
  };
}

export async function POST(req: NextRequest) {
  if (SOLANA_NETWORK !== "mainnet-beta") {
    return fail(
      400,
      `Swaps require mainnet-beta — current network is ${SOLANA_NETWORK}. Jupiter liquidity only exists on mainnet.`
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return fail(400, "Invalid JSON body.");
  }

  const fromSymbol =
    typeof body.fromToken === "string" ? body.fromToken : undefined;
  const toSymbol = typeof body.toToken === "string" ? body.toToken : undefined;
  const amount = typeof body.amount === "number" ? body.amount : undefined;
  const slippageBps =
    typeof body.slippageBps === "number" && body.slippageBps > 0
      ? Math.round(body.slippageBps)
      : 50;

  if (!fromSymbol || !toSymbol || !amount) {
    return fail(400, "fromToken, toToken, and amount are required.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail(400, "amount must be a positive number.");
  }
  if (fromSymbol.toUpperCase() === toSymbol.toUpperCase()) {
    return fail(400, "fromToken and toToken must be different.");
  }

  const input = getToken(fromSymbol);
  const output = getToken(toSymbol);
  if (!input) return fail(400, `Unsupported token: ${fromSymbol}.`);
  if (!output) return fail(400, `Unsupported token: ${toSymbol}.`);

  let baseAmount: bigint;
  try {
    baseAmount = toBaseUnits(amount, input.decimals);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid amount.";
    return fail(400, msg);
  }
  if (baseAmount <= BigInt(0)) return fail(400, "Amount is too small to swap.");

  let quote: JupiterQuote;
  try {
    quote = await getQuote({
      inputMint: input.mint,
      outputMint: output.mint,
      amount: baseAmount.toString(),
      slippageBps,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Jupiter request failed.";
    return fail(502, msg);
  }

  const display = buildDisplay(quote, input, output);
  return NextResponse.json({ success: true, data: { quote, display } });
}
