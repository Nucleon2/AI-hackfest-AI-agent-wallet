import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { computeNextExecutionAt } from "@/lib/scheduleUtils";
import type { ScheduledPayment } from "@/types/schedule";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let walletPubkey: string;
  try {
    const body = (await req.json()) as {
      walletPubkey?: unknown;
      signature?: unknown;
    };
    if (typeof body.walletPubkey !== "string") throw new Error();
    walletPubkey = body.walletPubkey;
  } catch {
    return NextResponse.json(
      { success: false, error: "walletPubkey required" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const lookup = await db.execute({
    sql: "SELECT * FROM scheduled_payments WHERE id = ?",
    args: [id],
  });
  const row = lookup.rows[0] as unknown as ScheduledPayment | undefined;

  if (!row) {
    return NextResponse.json(
      { success: false, error: "Schedule not found" },
      { status: 404 }
    );
  }
  if (row.wallet_pubkey !== walletPubkey) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 403 }
    );
  }

  const now = Date.now();
  const nextMs = computeNextExecutionAt(row);

  if (nextMs === null) {
    await db.execute({
      sql: `UPDATE scheduled_payments
            SET status = 'completed', last_executed_at = ?, execution_count = execution_count + 1
            WHERE id = ?`,
      args: [now, id],
    });
  } else {
    await db.execute({
      sql: `UPDATE scheduled_payments
            SET next_execution_at = ?, last_executed_at = ?, execution_count = execution_count + 1
            WHERE id = ?`,
      args: [nextMs, now, id],
    });
  }

  const updatedRes = await db.execute({
    sql: "SELECT * FROM scheduled_payments WHERE id = ?",
    args: [id],
  });
  const updated = updatedRes.rows[0] as unknown as ScheduledPayment;

  return NextResponse.json({ success: true, data: updated });
}
