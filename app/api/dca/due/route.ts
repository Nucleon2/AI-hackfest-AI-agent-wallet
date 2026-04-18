import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb } from "@/lib/db";
import type { DCAOrder } from "@/types/intent";

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
      `SELECT * FROM dca_orders
       WHERE wallet_pubkey = ?
         AND is_active = 1
         AND next_run_at <= ?
       ORDER BY next_run_at ASC
       LIMIT 1`
    )
    .all(wallet, now) as DCAOrder[];

  return NextResponse.json({ success: true, data: rows });
}
