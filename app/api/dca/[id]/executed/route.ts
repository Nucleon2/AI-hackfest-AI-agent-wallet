import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { computeNextDCARun } from "@/lib/dcaUtils";
import type { DCAOrder } from "@/types/intent";

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

  const row = getDb()
    .prepare("SELECT * FROM dca_orders WHERE id = ?")
    .get(id) as DCAOrder | undefined;

  if (!row) {
    return NextResponse.json(
      { success: false, error: "DCA order not found" },
      { status: 404 }
    );
  }
  if (row.wallet_pubkey !== walletPubkey) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 403 }
    );
  }
  if (row.is_active !== 1) {
    return NextResponse.json(
      { success: false, error: "Order is not active" },
      { status: 409 }
    );
  }
  const now = Date.now();
  if (row.next_run_at > now) {
    return NextResponse.json(
      { success: false, error: "Order is not yet due" },
      { status: 409 }
    );
  }

  const nextRunsCompleted = row.runs_completed + 1;
  const shouldDeactivate =
    row.max_runs !== null && nextRunsCompleted >= row.max_runs;

  // Idempotency guard: only mutate if the row still matches the snapshot we read.
  // Concurrent callers lose the race and get 0 changes; we surface that as 409.
  let changes = 0;
  if (shouldDeactivate) {
    const info = getDb()
      .prepare(
        `UPDATE dca_orders
         SET runs_completed = ?, last_executed_at = ?, is_active = 0
         WHERE id = ? AND is_active = 1 AND next_run_at <= ? AND runs_completed = ?`
      )
      .run(nextRunsCompleted, now, id, now, row.runs_completed);
    changes = info.changes;
  } else {
    const nextRunAt = computeNextDCARun(row);
    const info = getDb()
      .prepare(
        `UPDATE dca_orders
         SET runs_completed = ?, last_executed_at = ?, next_run_at = ?
         WHERE id = ? AND is_active = 1 AND next_run_at <= ? AND runs_completed = ?`
      )
      .run(nextRunsCompleted, now, nextRunAt, id, now, row.runs_completed);
    changes = info.changes;
  }

  if (changes === 0) {
    return NextResponse.json(
      { success: false, error: "Order state changed concurrently" },
      { status: 409 }
    );
  }

  const updated = getDb()
    .prepare("SELECT * FROM dca_orders WHERE id = ?")
    .get(id) as DCAOrder;

  return NextResponse.json({ success: true, data: updated });
}
