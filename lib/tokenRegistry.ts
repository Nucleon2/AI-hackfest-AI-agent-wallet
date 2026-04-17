export interface TokenInfo {
  symbol: string;
  mint: string;
  decimals: number;
}

export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export const TOKEN_REGISTRY: Record<string, TokenInfo> = {
  SOL: { symbol: "SOL", mint: WRAPPED_SOL_MINT, decimals: 9 },
  USDC: {
    symbol: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
  },
  USDT: {
    symbol: "USDT",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
  },
  BONK: {
    symbol: "BONK",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    decimals: 5,
  },
  JUP: {
    symbol: "JUP",
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    decimals: 6,
  },
};

export function getToken(symbol: string): TokenInfo | null {
  const key = symbol.trim().toUpperCase();
  return TOKEN_REGISTRY[key] ?? null;
}

export function toBaseUnits(uiAmount: number, decimals: number): bigint {
  if (!Number.isFinite(uiAmount) || uiAmount < 0) {
    throw new Error("Amount must be a non-negative finite number.");
  }
  const [intPart, fracPartRaw = ""] = uiAmount.toFixed(decimals).split(".");
  const fracPart = fracPartRaw.padEnd(decimals, "0").slice(0, decimals);
  const combined = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "");
  return BigInt(combined.length === 0 ? "0" : combined);
}

export function fromBaseUnits(
  base: string | bigint,
  decimals: number
): number {
  const raw = typeof base === "bigint" ? base.toString() : base;
  if (!/^-?\d+$/.test(raw)) return 0;
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  const padded = digits.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);
  const str = `${negative ? "-" : ""}${intPart}.${fracPart}`;
  return Number.parseFloat(str);
}
