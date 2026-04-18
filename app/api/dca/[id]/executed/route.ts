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

  const now = Date.now();
  const nextRunsCompleted = row.runs_completed + 1;
  const shouldDeactivate =
    row.max_runs !== null && nextRunsCompleted >= row.max_runs;

  if (shouldDeactivate) {
    getDb()
      .prepare(
        `UPDATE dca_orders
         SET runs_completed = ?, last_executed_at = ?, is_active = 0
         WHERE id = ?`
      )
      .run(nextRunsCompleted, now, id);
  } else {
    const nextRunAt = computeNextDCARun(row);
    getDb()
      .prepare(
        `UPDATE dca_orders
         SET runs_completed = ?, last_executed_at = ?, next_run_at = ?
         WHERE id = ?`
      )
      .run(nextRunsCompleted, now, nextRunAt, id);
  }

  const updated = getDb()
    .prepare("SELECT * FROM dca_orders WHERE id = ?")
    .get(id) as DCAOrder;

  return NextResponse.json({ success: true, data: updated });
}
