import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb } from "@/lib/db";
import { computeFirstDCARun, parseDayOfWeek } from "@/lib/dcaUtils";
import { getToken } from "@/lib/tokenRegistry";
import { isIntent, type DCAIntent, type DCAOrder } from "@/types/intent";

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
      `SELECT * FROM dca_orders
       WHERE wallet_pubkey = ? AND is_active = 1
       ORDER BY next_run_at ASC`
    )
    .all(wallet) as DCAOrder[];

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

  if (!isIntent(intent) || intent.action !== "dca") {
    return NextResponse.json(
      { success: false, error: "Invalid DCA intent" },
      { status: 400 }
    );
  }
  const dca = intent as DCAIntent;

  const inputToken = dca.inputToken.toUpperCase();
  const outputToken = dca.outputToken.toUpperCase();
  if (!getToken(inputToken)) {
    return NextResponse.json(
      { success: false, error: `Unsupported input token: ${inputToken}` },
      { status: 400 }
    );
  }
  if (!getToken(outputToken)) {
    return NextResponse.json(
      { success: false, error: `Unsupported output token: ${outputToken}` },
      { status: 400 }
    );
  }
  if (inputToken === outputToken) {
    return NextResponse.json(
      { success: false, error: "Input and output tokens must differ" },
      { status: 400 }
    );
  }

  let dayOfWeek: number | null = null;
  if (dca.interval === "weekly") {
    if (dca.day_of_week) {
      const parsed = parseDayOfWeek(dca.day_of_week);
      if (parsed === null) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid day_of_week: ${dca.day_of_week}. Expected a weekday name like "monday".`,
          },
          { status: 400 }
        );
      }
      dayOfWeek = parsed;
    } else {
      dayOfWeek = 1; // Monday default — persisted so the stored order matches what will run
    }
  }
  const nowMs = Date.now();
  const nextRunAt = computeFirstDCARun(dca.interval, dayOfWeek, nowMs);

  const row: DCAOrder = {
    id: crypto.randomUUID(),
    wallet_pubkey: walletPubkey,
    input_token: inputToken,
    output_token: outputToken,
    amount_usd: dca.amountUsd,
    interval: dca.interval,
    day_of_week: dayOfWeek,
    next_run_at: nextRunAt,
    runs_completed: 0,
    max_runs: typeof dca.duration === "number" && dca.duration > 0 ? Math.floor(dca.duration) : null,
    is_active: 1,
    created_at: nowMs,
    last_executed_at: null,
  };

  getDb()
    .prepare(
      `INSERT INTO dca_orders
       (id, wallet_pubkey, input_token, output_token, amount_usd, interval,
        day_of_week, next_run_at, runs_completed, max_runs, is_active,
        created_at, last_executed_at)
       VALUES
       (@id, @wallet_pubkey, @input_token, @output_token, @amount_usd, @interval,
        @day_of_week, @next_run_at, @runs_completed, @max_runs, @is_active,
        @created_at, @last_executed_at)`
    )
    .run(row);

  return NextResponse.json({ success: true, data: row });
}
