import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb } from "@/lib/db";
import type { Contact } from "@/types/contact";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ success: false, error: "wallet is required." }, { status: 400 });
  }

  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid wallet address." }, { status: 400 });
  }

  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM contacts WHERE wallet_pubkey = ? ORDER BY name COLLATE NOCASE ASC",
    args: [wallet],
  });
  const rows = res.rows as unknown as Contact[];

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  let body: { walletPubkey?: unknown; name?: unknown; address?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const walletPubkey = typeof body.walletPubkey === "string" ? body.walletPubkey.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";

  if (!walletPubkey || !name || !address) {
    return NextResponse.json(
      { success: false, error: "walletPubkey, name, and address are required." },
      { status: 400 }
    );
  }

  try {
    new PublicKey(walletPubkey);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid wallet address." }, { status: 400 });
  }

  try {
    new PublicKey(address);
  } catch {
    return NextResponse.json(
      { success: false, error: `"${address}" is not a valid Solana address.` },
      { status: 400 }
    );
  }

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  await db.execute({
    sql: `INSERT INTO contacts (id, wallet_pubkey, name, address, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(wallet_pubkey, name) DO UPDATE SET address = excluded.address`,
    args: [id, walletPubkey, name, address, now],
  });

  const savedRes = await db.execute({
    sql: "SELECT * FROM contacts WHERE wallet_pubkey = ? AND name = ? COLLATE NOCASE",
    args: [walletPubkey, name],
  });
  const saved = savedRes.rows[0] as unknown as Contact;

  return NextResponse.json({ success: true, data: saved });
}
