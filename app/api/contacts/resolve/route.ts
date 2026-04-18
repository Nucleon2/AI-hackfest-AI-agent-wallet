import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb } from "@/lib/db";
import type { Contact } from "@/types/contact";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  const name = req.nextUrl.searchParams.get("name");

  if (!wallet || !name) {
    return NextResponse.json(
      { success: false, error: "wallet and name are required." },
      { status: 400 }
    );
  }

  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid wallet address." }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM contacts WHERE wallet_pubkey = ? AND name = ? COLLATE NOCASE")
    .get(wallet, name) as Contact | undefined;

  if (!row) {
    return NextResponse.json(
      { success: false, error: `No contact named "${name}" found.` },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: { address: row.address } });
}
