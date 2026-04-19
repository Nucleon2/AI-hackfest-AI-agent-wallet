import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { name: string } }
) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  const contactName = decodeURIComponent(params.name);

  if (!wallet) {
    return NextResponse.json({ success: false, error: "wallet is required." }, { status: 400 });
  }

  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid wallet address." }, { status: 400 });
  }

  const db = await getDb();
  const result = await db.execute({
    sql: "DELETE FROM contacts WHERE wallet_pubkey = ? AND name = ? COLLATE NOCASE",
    args: [wallet, contactName],
  });

  if (result.rowsAffected === 0) {
    return NextResponse.json(
      { success: false, error: `Contact "${contactName}" not found.` },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
