import Anthropic from "@anthropic-ai/sdk";
import { PublicKey, LAMPORTS_PER_SOL, type Connection } from "@solana/web3.js";
import { TOKEN_REGISTRY } from "@/lib/tokenRegistry";
import type {
  PortfolioTarget,
  TokenAllocation,
  PortfolioStatus,
  RebalanceSwap,
} from "@/types/intent";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

const MINIMUM_SWAP_USD = 1.0;
const PRICE_CACHE_TTL = 10_000;
const JUPITER_QUOTE_BASE = "https://lite-api.jup.ag/swap/v1";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const priceCache = new Map<string, { price: number; fetchedAt: number }>();

// Derives token price in USD (USDC) by requesting a 1-unit swap quote from Jupiter
async function fetchSingleTokenPrice(mint: string): Promise<number> {
  if (mint === USDC_MINT) return 1.0;

  const info = Object.values(TOKEN_REGISTRY).find((t) => t.mint === mint);
  if (!info) return 0;

  // Use 1 UI unit = 10^decimals base units
  const amount = Math.pow(10, info.decimals);
  const url = `${JUPITER_QUOTE_BASE}/quote?inputMint=${mint}&outputMint=${USDC_MINT}&amount=${Math.floor(amount)}&slippageBps=50&onlyDirectRoutes=false`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const json = (await res.json()) as { outAmount?: string };
    if (!json.outAmount) return 0;
    // outAmount is in USDC base units (6 decimals)
    return parseInt(json.outAmount, 10) / 1_000_000;
  } catch {
    return 0;
  }
}

export async function fetchTokenPrices(
  mints: string[]
): Promise<Record<string, number>> {
  const now = Date.now();
  const result: Record<string, number> = {};
  const fetchPromises: Promise<void>[] = [];

  for (const mint of mints) {
    const cached = priceCache.get(mint);
    if (cached && now - cached.fetchedAt < PRICE_CACHE_TTL) {
      result[mint] = cached.price;
    } else {
      fetchPromises.push(
        fetchSingleTokenPrice(mint).then((price) => {
          result[mint] = price;
          priceCache.set(mint, { price, fetchedAt: now });
        })
      );
    }
  }

  await Promise.all(fetchPromises);
  return result;
}

export async function fetchTokenBalances(
  pubkey: PublicKey,
  connection: Connection,
  tokens: string[]
): Promise<Record<string, number>> {
  const balances: Record<string, number> = {};

  for (const token of tokens) {
    balances[token] = 0;
  }

  // SOL native balance
  if (tokens.includes("SOL")) {
    const lamports = await connection.getBalance(pubkey);
    balances["SOL"] = lamports / LAMPORTS_PER_SOL;
  }

  // SPL token balances
  const splTokens = tokens.filter((t) => t !== "SOL");
  if (splTokens.length === 0) return balances;

  const mintToSymbol: Record<string, string> = {};
  for (const sym of splTokens) {
    const info = TOKEN_REGISTRY[sym];
    if (info) mintToSymbol[info.mint] = sym;
  }

  const accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
    programId: TOKEN_PROGRAM_ID,
  });

  for (const { account } of accounts.value) {
    const parsed = account.data.parsed as {
      info: { mint: string; tokenAmount: { uiAmount: number | null } };
    };
    const mint = parsed.info.mint;
    const sym = mintToSymbol[mint];
    if (sym !== undefined) {
      balances[sym] = parsed.info.tokenAmount.uiAmount ?? 0;
    }
  }

  return balances;
}

export function calculateAllocations(
  balances: Record<string, number>,
  prices: Record<string, number>,
  targets: PortfolioTarget[]
): { allocations: TokenAllocation[]; totalValueUsd: number } {
  let totalValueUsd = 0;
  const values: Record<string, number> = {};

  for (const target of targets) {
    const token = target.token;
    const info = TOKEN_REGISTRY[token];
    if (!info) continue;
    const balance = balances[token] ?? 0;
    const price = prices[info.mint] ?? 0;
    const value = balance * price;
    values[token] = value;
    totalValueUsd += value;
  }

  const allocations: TokenAllocation[] = targets.map((target) => {
    const token = target.token;
    const info = TOKEN_REGISTRY[token];
    const balance = balances[token] ?? 0;
    const price = info ? (prices[info.mint] ?? 0) : 0;
    const valueUsd = values[token] ?? 0;
    const currentPct = totalValueUsd > 0 ? (valueUsd / totalValueUsd) * 100 : 0;
    const drift = currentPct - target.percentage;
    return {
      token,
      currentPct,
      targetPct: target.percentage,
      drift,
      valueUsd,
      balanceUi: balance,
      priceUsd: price,
    };
  });

  return { allocations, totalValueUsd };
}

export function buildRebalanceSwaps(
  allocations: TokenAllocation[],
  totalValueUsd: number,
  prices: Record<string, number>,
  minSwapUsd: number = MINIMUM_SWAP_USD
): RebalanceSwap[] {
  const sellers: Array<{ token: string; excessUsd: number; price: number }> = [];
  const buyers: Array<{ token: string; deficitUsd: number }> = [];

  for (const alloc of allocations) {
    const excessUsd = (alloc.drift / 100) * totalValueUsd;
    if (excessUsd > minSwapUsd) {
      sellers.push({ token: alloc.token, excessUsd, price: alloc.priceUsd });
    } else if (excessUsd < -minSwapUsd) {
      buyers.push({ token: alloc.token, deficitUsd: -excessUsd });
    }
  }

  sellers.sort((a, b) => b.excessUsd - a.excessUsd);
  buyers.sort((a, b) => b.deficitUsd - a.deficitUsd);

  const swaps: RebalanceSwap[] = [];
  let si = 0;
  let bi = 0;

  while (si < sellers.length && bi < buyers.length) {
    const seller = sellers[si];
    const buyer = buyers[bi];

    const swapUsd = Math.min(seller.excessUsd, buyer.deficitUsd);
    if (swapUsd < minSwapUsd) break;

    const fromAmount = seller.price > 0 ? swapUsd / seller.price : 0;
    if (fromAmount > 0) {
      swaps.push({
        fromToken: seller.token,
        toToken: buyer.token,
        fromAmount: Math.round(fromAmount * 1e6) / 1e6,
        slippageBps: 100,
        reason: `${seller.token} is ${Math.abs(allocations.find((a) => a.token === seller.token)!.drift).toFixed(1)}% over target`,
      });
    }

    seller.excessUsd -= swapUsd;
    buyer.deficitUsd -= swapUsd;

    if (seller.excessUsd < minSwapUsd) si++;
    if (buyer.deficitUsd < minSwapUsd) bi++;
  }

  return swaps;
}

export async function askClaudeForRebalance(
  status: PortfolioStatus,
  apiKey: string
): Promise<{ swaps: RebalanceSwap[]; reasoning: string }> {
  const client = new Anthropic({ apiKey });

  const allocationSummary = status.allocations.map((a) => ({
    token: a.token,
    currentPct: Math.round(a.currentPct * 10) / 10,
    targetPct: a.targetPct,
    drift: Math.round(a.drift * 10) / 10,
    valueUsd: Math.round(a.valueUsd * 100) / 100,
    balanceUi: a.balanceUi,
  }));

  const prompt = `You are a portfolio rebalancing engine for a Solana wallet.

Current portfolio:
${JSON.stringify(allocationSummary, null, 2)}

Total value: $${status.totalValueUsd.toFixed(2)} USD
Drift threshold: ${status.config.drift_threshold}%
Max drift detected: ${status.maxDrift.toFixed(1)}%

Decide which swaps to execute to rebalance the portfolio. Rules:
1. Only swap tokens that exceed the drift threshold (${status.config.drift_threshold}%)
2. Minimum swap size: $${MINIMUM_SWAP_USD} USD (skip smaller adjustments)
3. Prefer fewer, larger swaps over many small ones
4. Sell overweight tokens, buy underweight tokens

Respond ONLY with valid JSON in this exact format:
{"swaps":[{"fromToken":"SOL","toToken":"USDC","fromAmount":0.5,"slippageBps":100,"reason":"SOL is 12% over target"}],"reasoning":"Brief explanation"}

If no rebalancing is needed, return: {"swaps":[],"reasoning":"Portfolio is within threshold"}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  try {
    const parsed = JSON.parse(text) as {
      swaps: RebalanceSwap[];
      reasoning: string;
    };
    return {
      swaps: Array.isArray(parsed.swaps) ? parsed.swaps : [],
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1)) as {
          swaps: RebalanceSwap[];
          reasoning: string;
        };
        return {
          swaps: Array.isArray(parsed.swaps) ? parsed.swaps : [],
          reasoning: parsed.reasoning ?? "",
        };
      } catch {
        // fall through
      }
    }
    // fallback to algorithmic
    const fallback = buildRebalanceSwaps(
      status.allocations,
      status.totalValueUsd,
      Object.fromEntries(
        status.allocations.map((a) => {
          const info = TOKEN_REGISTRY[a.token];
          return [info?.mint ?? a.token, a.priceUsd];
        })
      )
    );
    return { swaps: fallback, reasoning: "Algorithmic fallback rebalancing" };
  }
}
