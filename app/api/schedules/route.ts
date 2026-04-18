import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb } from "@/lib/db";
import { computeFirstExecutionAt } from "@/lib/scheduleUtils";
import { validateRecipient } from "@/lib/transactionBuilder";
import { isIntent, type ScheduleIntent } from "@/types/intent";
import type { ScheduledPayment } from "@/types/schedule";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json(
      { success: false, error: "wallet query param required" },
      { status: 400 }
    );
  }
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid wallet pubkey" },
      { status: 400 }
    );
  }

  const rows = getDb()
    .prepare(
      `SELECT * FROM scheduled_payments
       WHERE wallet_pubkey = ? AND status = 'active'
       ORDER BY next_execution_at ASC`
    )
    .all(wallet) as ScheduledPayment[];

  return NextResponse.json({ success: true, data: rows });
}

interface CreateBody {
  intent?: unknown;
  walletPubkey?: unknown;
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { intent, walletPubkey } = body;

  if (typeof walletPubkey !== "string") {
    return NextResponse.json(
      { success: false, error: "walletPubkey required" },
      { status: 400 }
    );
  }
  try {
    new PublicKey(walletPubkey);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid walletPubkey" },
      { status: 400 }
    );
  }

  if (!isIntent(intent) || intent.action !== "schedule") {
    return NextResponse.json(
      { success: false, error: "Invalid schedule intent" },
      { status: 400 }
    );
  }
  const scheduleIntent = intent as ScheduleIntent;

  const validation = validateRecipient(scheduleIntent.recipient);
  if (!validation.ok) {
    return NextResponse.json(
      { success: false, error: validation.error },
      { status: 400 }
    );
  }

  const DAY_NAMES = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const dayOfWeekNum =
    scheduleIntent.frequency === "weekly" && scheduleIntent.day_of_week
      ? DAY_NAMES.indexOf(scheduleIntent.day_of_week.toLowerCase())
      : null;

  const nowMs = Date.now();
  const nextExecution = computeFirstExecutionAt(scheduleIntent, nowMs);

  const row: ScheduledPayment = {
    id: crypto.randomUUID(),
    wallet_pubkey: walletPubkey,
    recipient: validation.pubkey.toBase58(),
    amount_sol: scheduleIntent.amount,
    token: scheduleIntent.token.toUpperCase(),
    frequency: scheduleIntent.frequency,
    day_of_week: dayOfWeekNum !== null && dayOfWeekNum >= 0 ? dayOfWeekNum : null,
    day_of_month: null,
    label: scheduleIntent.label,
    created_at: nowMs,
    next_execution_at: nextExecution,
    last_executed_at: null,
    execution_count: 0,
    status: "active",
  };

  getDb()
    .prepare(
      `INSERT INTO scheduled_payments
       (id, wallet_pubkey, recipient, amount_sol, token, frequency,
        day_of_week, day_of_month, label, created_at, next_execution_at,
        last_executed_at, execution_count, status)
       VALUES
       (@id, @wallet_pubkey, @recipient, @amount_sol, @token, @frequency,
        @day_of_week, @day_of_month, @label, @created_at, @next_execution_at,
        @last_executed_at, @execution_count, @status)`
    )
    .run(row);

  return NextResponse.json({ success: true, data: row });
}
