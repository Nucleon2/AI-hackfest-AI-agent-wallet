import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { ScheduledPayment } from "@/types/schedule";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let walletPubkey: string;
  try {
    const body = (await req.json()) as { walletPubkey?: unknown };
    if (typeof body.walletPubkey !== "string") throw new Error();
    walletPubkey = body.walletPubkey;
  } catch {
    return NextResponse.json(
      { success: false, error: "walletPubkey required" },
      { status: 400 }
    );
  }

  const row = getDb()
    .prepare("SELECT * FROM scheduled_payments WHERE id = ?")
    .get(id) as ScheduledPayment | undefined;

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

  getDb()
    .prepare(
      "UPDATE scheduled_payments SET status = 'cancelled' WHERE id = ?"
    )
    .run(id);

  return NextResponse.json({ success: true });
}
