import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb } from "@/lib/db";
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

  const now = Date.now();
  const rows = getDb()
    .prepare(
      `SELECT * FROM scheduled_payments
       WHERE wallet_pubkey = ?
         AND status = 'active'
         AND next_execution_at <= ?
       ORDER BY next_execution_at ASC
       LIMIT 1`
    )
    .all(wallet, now) as ScheduledPayment[];

  return NextResponse.json({ success: true, data: rows });
}
