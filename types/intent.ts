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
  | "delete_contact"
  | "multi_step"
  | "set_portfolio"
  | "view_portfolio"
  | "pause_portfolio"
  | "resume_portfolio"
  | "set_drift_threshold"
  | "stake"
  | "unstake"
  | "staking_status"
  | "explain_tx"
  | "spending_insights"
  | "dca"
  | "view_dca"
  | "cancel_dca"
  | "price_alert";

export type StakingProvider = "marinade" | "jito";

export interface PortfolioTarget {
  token: string;
  percentage: number;
}

export interface PortfolioConfig {
  id: string;
  wallet_pubkey: string;
  targets: PortfolioTarget[];
  drift_threshold: number;
  is_active: boolean;
  auto_execute: boolean;
  last_rebalanced_at: number | null;
  created_at: number;
}

export interface TokenAllocation {
  token: string;
  currentPct: number;
  targetPct: number;
  drift: number;
  valueUsd: number;
  balanceUi: number;
  priceUsd: number;
}

export interface PortfolioStatus {
  allocations: TokenAllocation[];
  totalValueUsd: number;
  maxDrift: number;
  needsRebalance: boolean;
  config: PortfolioConfig;
  fetchedAt: number;
}

export interface RebalanceSwap {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  slippageBps: number;
  reason: string;
}

export interface SetPortfolioIntent {
  action: "set_portfolio";
  targets: PortfolioTarget[];
  drift_threshold?: number;
  auto_execute?: boolean;
}

export interface ViewPortfolioIntent {
  action: "view_portfolio";
}

export interface PausePortfolioIntent {
  action: "pause_portfolio";
}

export interface ResumePortfolioIntent {
  action: "resume_portfolio";
}

export interface SetDriftThresholdIntent {
  action: "set_drift_threshold";
  threshold: number;
}

export interface ExplainTxIntent {
  action: "explain_tx";
  signature: string;
}

export interface SpendingInsightsIntent {
  action: "spending_insights";
}

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

export interface MultiStepSwapStep {
  type: "swap";
  fromToken: string;
  toToken: string;
  amount: number;
  slippageBps?: number;
}

export interface MultiStepSendStep {
  type: "send";
  amount: number | null; // null = use previous step's swap output
  token: string;
  recipient: string;
  memo?: string;
}

export interface MultiStepHistoryStep {
  type: "history";
  limit?: number;
}

export interface MultiStepBalanceStep {
  type: "balance";
  token?: string;
}

export type MultiStepStep = MultiStepSwapStep | MultiStepSendStep | MultiStepHistoryStep | MultiStepBalanceStep;

export interface MultiStepIntent {
  action: "multi_step";
  steps: MultiStepStep[];
  description: string;
}

export interface StakeIntent {
  action: "stake";
  amount: number;
  provider: StakingProvider;
}

export interface UnstakeIntent {
  action: "unstake";
  amount: number | null;
  provider: StakingProvider;
}

export interface StakingStatusIntent {
  action: "staking_status";
}

export interface DCAIntent {
  action: "dca";
  inputToken: string;
  outputToken: string;
  amountUsd: number;
  interval: "daily" | "weekly" | "monthly";
  duration?: number;
  day_of_week?: string;
}

export interface ViewDCAIntent {
  action: "view_dca";
}

export interface CancelDCAIntent {
  action: "cancel_dca";
  id: string;
}

export interface PriceAlertIntent {
  action: "price_alert";
  token: string;
  targetPrice: number;
  direction: "above" | "below";
}

export interface DCAOrder {
  id: string;
  wallet_pubkey: string;
  input_token: string;
  output_token: string;
  amount_usd: number;
  interval: "daily" | "weekly" | "monthly";
  day_of_week: number | null;
  next_run_at: number;
  runs_completed: number;
  max_runs: number | null;
  is_active: number;
  created_at: number;
  last_executed_at: number | null;
}

export interface PriceAlert {
  id: string;
  wallet_pubkey: string;
  token: string;
  target_price: number;
  direction: "above" | "below";
  is_triggered: number;
  created_at: number;
  triggered_at: number | null;
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
  | DeleteContactIntent
  | MultiStepIntent
  | SetPortfolioIntent
  | ViewPortfolioIntent
  | PausePortfolioIntent
  | ResumePortfolioIntent
  | SetDriftThresholdIntent
  | StakeIntent
  | UnstakeIntent
  | StakingStatusIntent
  | ExplainTxIntent
  | SpendingInsightsIntent
  | DCAIntent
  | ViewDCAIntent
  | CancelDCAIntent
  | PriceAlertIntent;

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
    case "multi_step":
      return (
        Array.isArray(value.steps) &&
        (value.steps as unknown[]).length >= 2 &&
        typeof value.description === "string"
      );
    case "set_portfolio": {
      if (!Array.isArray(value.targets) || (value.targets as unknown[]).length === 0) return false;
      const targets = value.targets as unknown[];
      const allValid = targets.every(
        (t) =>
          isRecord(t) &&
          typeof t.token === "string" &&
          typeof t.percentage === "number"
      );
      if (!allValid) return false;
      const sum = (targets as { percentage: number }[]).reduce((acc, t) => acc + t.percentage, 0);
      return Math.abs(sum - 100) <= 1.5;
    }
    case "view_portfolio":
      return true;
    case "pause_portfolio":
      return true;
    case "resume_portfolio":
      return true;
    case "set_drift_threshold":
      return typeof value.threshold === "number" && value.threshold > 0;
    case "stake":
      return (
        typeof value.amount === "number" &&
        value.amount > 0 &&
        (value.provider === "marinade" || value.provider === "jito")
      );
    case "unstake":
      return (
        (value.amount === null || (typeof value.amount === "number" && value.amount > 0)) &&
        (value.provider === "marinade" || value.provider === "jito")
      );
    case "staking_status":
      return true;
    case "explain_tx":
      return typeof value.signature === "string" && value.signature.length > 0;
    case "spending_insights":
      return true;
    case "dca":
      return (
        typeof value.inputToken === "string" &&
        typeof value.outputToken === "string" &&
        typeof value.amountUsd === "number" &&
        value.amountUsd > 0 &&
        (value.interval === "daily" ||
          value.interval === "weekly" ||
          value.interval === "monthly") &&
        (value.duration === undefined ||
          (Number.isInteger(value.duration) && (value.duration as number) > 0)) &&
        (value.day_of_week === undefined ||
          (typeof value.day_of_week === "string" && value.interval === "weekly"))
      );
    case "view_dca":
      return true;
    case "cancel_dca":
      return typeof value.id === "string";
    case "price_alert":
      return (
        typeof value.token === "string" &&
        typeof value.targetPrice === "number" &&
        value.targetPrice > 0 &&
        (value.direction === "above" || value.direction === "below")
      );
    default:
      return false;
  }
}
