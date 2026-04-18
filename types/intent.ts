export type IntentAction =
  | "send"
  | "swap"
  | "balance"
  | "history"
  | "unknown"
  | "schedule"
  | "view_schedules"
  | "cancel_schedule"
  | "save_contact"
  | "list_contacts"
  | "delete_contact";

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

export interface ScheduleIntent {
  action: "schedule";
  amount: number;
  token: string;
  recipient: string;
  frequency: "once" | "daily" | "weekly" | "monthly";
  day_of_week?: string;
  scheduled_date?: string;
  label: string;
}

export interface ViewSchedulesIntent {
  action: "view_schedules";
}

export interface CancelScheduleIntent {
  action: "cancel_schedule";
  description?: string;
}

export interface SaveContactIntent {
  action: "save_contact";
  name: string;
  address: string;
}

export interface ListContactsIntent {
  action: "list_contacts";
}

export interface DeleteContactIntent {
  action: "delete_contact";
  name: string;
}

export type Intent =
  | SendIntent
  | SwapIntent
  | BalanceIntent
  | HistoryIntent
  | UnknownIntent
  | ScheduleIntent
  | ViewSchedulesIntent
  | CancelScheduleIntent
  | SaveContactIntent
  | ListContactsIntent
  | DeleteContactIntent;

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
    case "schedule":
      return (
        typeof value.amount === "number" &&
        typeof value.token === "string" &&
        typeof value.recipient === "string" &&
        typeof value.label === "string" &&
        (value.frequency === "once" ||
          value.frequency === "daily" ||
          value.frequency === "weekly" ||
          value.frequency === "monthly")
      );
    case "view_schedules":
      return true;
    case "cancel_schedule":
      return (
        value.description === undefined ||
        typeof value.description === "string"
      );
    case "save_contact":
      return typeof value.name === "string" && typeof value.address === "string";
    case "list_contacts":
      return true;
    case "delete_contact":
      return typeof value.name === "string";
    default:
      return false;
  }
}
