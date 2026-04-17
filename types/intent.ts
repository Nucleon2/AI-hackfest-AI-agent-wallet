export type IntentAction = "send" | "swap" | "balance" | "history" | "unknown";

export interface SendIntent {
  action: "send";
  amount: number;
  token: string;
  recipient: string;
  memo?: string;
}

export interface SwapIntent {
  action: "swap";
  fromToken: string;
  toToken: string;
  amount: number;
  slippageBps?: number;
}

export interface BalanceIntent {
  action: "balance";
  token?: string;
}

export interface HistoryIntent {
  action: "history";
  limit?: number;
}

export interface UnknownIntent {
  action: "unknown";
  clarification: string;
}

export type Intent =
  | SendIntent
  | SwapIntent
  | BalanceIntent
  | HistoryIntent
  | UnknownIntent;

export interface WalletContext {
  publicKey?: string;
  solBalance?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isIntent(value: unknown): value is Intent {
  if (!isRecord(value)) return false;
  const action = value.action;
  switch (action) {
    case "send":
      return (
        typeof value.amount === "number" &&
        typeof value.token === "string" &&
        typeof value.recipient === "string"
      );
    case "swap":
      return (
        typeof value.amount === "number" &&
        typeof value.fromToken === "string" &&
        typeof value.toToken === "string"
      );
    case "balance":
      return value.token === undefined || typeof value.token === "string";
    case "history":
      return value.limit === undefined || typeof value.limit === "number";
    case "unknown":
      return typeof value.clarification === "string";
    default:
      return false;
  }
}
