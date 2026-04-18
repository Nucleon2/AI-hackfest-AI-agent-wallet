export interface ScheduledPayment {
  id: string;
  wallet_pubkey: string;
  recipient: string;
  amount_sol: number;
  token: string;
  frequency: "once" | "daily" | "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  label: string | null;
  created_at: number;
  next_execution_at: number;
  last_executed_at: number | null;
  execution_count: number;
  status: "active" | "cancelled" | "completed";
}
