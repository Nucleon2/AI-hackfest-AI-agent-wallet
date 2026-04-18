import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { PriceAlert } from "@/types/intent";

export const runtime = "nodejs";

async function authorize(
  req: NextRequest,
  id: string
): Promise<{ ok: true; row: PriceAlert } | { ok: false; response: NextResponse }> {
  let walletPubkey: string;
  try {
    const body = (await req.json()) as { walletPubkey?: unknown };
    if (typeof body.walletPubkey !== "string") throw new Error();
    walletPubkey = body.walletPubkey;
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "walletPubkey required" },
        { status: 400 }
      ),
    };
  }

  const row = getDb()
    .prepare("SELECT * FROM price_alerts WHERE id = ?")
    .get(id) as PriceAlert | undefined;

  if (!row) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Alert not found" },
        { status: 404 }
      ),
    };
  }
  if (row.wallet_pubkey !== walletPubkey) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, row };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorize(req, id);
  if (!auth.ok) return auth.response;

  getDb().prepare("DELETE FROM price_alerts WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorize(req, id);
  if (!auth.ok) return auth.response;

  const now = Date.now();
  getDb()
    .prepare(
      `UPDATE price_alerts SET is_triggered = 1, triggered_at = ? WHERE id = ?`
    )
    .run(now, id);

  const updated = getDb()
    .prepare("SELECT * FROM price_alerts WHERE id = ?")
    .get(id) as PriceAlert;

  return NextResponse.json({ success: true, data: updated });
}
