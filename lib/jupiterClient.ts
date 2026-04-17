const JUPITER_BASE = "https://lite-api.jup.ag/swap/v1";

export interface JupiterRoutePlanStep {
  swapInfo: {
    ammKey?: string;
    label?: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount?: string;
    feeMint?: string;
  };
  percent?: number;
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: JupiterRoutePlanStep[];
  contextSlot?: number;
  timeTaken?: number;
}

export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export interface GetQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  restrictIntermediateTokens?: boolean;
  swapMode?: "ExactIn" | "ExactOut";
}

export interface GetSwapTxParams {
  quote: JupiterQuote;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  dynamicComputeUnitLimit?: boolean;
  prioritizationFeeLamports?: "auto" | number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isJupiterQuote(value: unknown): value is JupiterQuote {
  if (!isRecord(value)) return false;
  return (
    typeof value.inputMint === "string" &&
    typeof value.outputMint === "string" &&
    typeof value.inAmount === "string" &&
    typeof value.outAmount === "string" &&
    typeof value.otherAmountThreshold === "string" &&
    typeof value.swapMode === "string" &&
    typeof value.slippageBps === "number" &&
    typeof value.priceImpactPct === "string" &&
    Array.isArray(value.routePlan)
  );
}

function isSwapResponse(value: unknown): value is JupiterSwapResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.swapTransaction === "string" &&
    typeof value.lastValidBlockHeight === "number"
  );
}

async function parseError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as unknown;
      if (isRecord(json) && typeof json.error === "string") return json.error;
      if (isRecord(json) && typeof json.message === "string")
        return json.message;
    } catch {
      /* fall through */
    }
    return text || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function getQuote(params: GetQuoteParams): Promise<JupiterQuote> {
  const url = new URL(`${JUPITER_BASE}/quote`);
  url.searchParams.set("inputMint", params.inputMint);
  url.searchParams.set("outputMint", params.outputMint);
  url.searchParams.set("amount", params.amount);
  url.searchParams.set("slippageBps", String(params.slippageBps));
  url.searchParams.set(
    "restrictIntermediateTokens",
    String(params.restrictIntermediateTokens ?? true)
  );
  if (params.swapMode) url.searchParams.set("swapMode", params.swapMode);

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Jupiter quote failed: ${await parseError(res)}`);
  }
  const json = (await res.json()) as unknown;
  if (!isJupiterQuote(json)) {
    throw new Error("Jupiter quote response was malformed.");
  }
  return json;
}

export async function getSwapTransaction(
  params: GetSwapTxParams
): Promise<JupiterSwapResponse> {
  const body = {
    quoteResponse: params.quote,
    userPublicKey: params.userPublicKey,
    wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
    dynamicComputeUnitLimit: params.dynamicComputeUnitLimit ?? true,
    prioritizationFeeLamports: params.prioritizationFeeLamports ?? "auto",
  };

  const res = await fetch(`${JUPITER_BASE}/swap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Jupiter swap failed: ${await parseError(res)}`);
  }
  const json = (await res.json()) as unknown;
  if (!isSwapResponse(json)) {
    throw new Error("Jupiter swap response was malformed.");
  }
  return json;
}
