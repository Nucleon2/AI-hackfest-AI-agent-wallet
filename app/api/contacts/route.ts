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

  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM contacts WHERE wallet_pubkey = ? ORDER BY name COLLATE NOCASE ASC")
    .all(wallet) as Contact[];

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

  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  // INSERT OR REPLACE gives upsert semantics — updating address if name already exists
  db.prepare(
    `INSERT INTO contacts (id, wallet_pubkey, name, address, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(wallet_pubkey, name) DO UPDATE SET address = excluded.address`
  ).run(id, walletPubkey, name, address, now);

  const saved = db
    .prepare("SELECT * FROM contacts WHERE wallet_pubkey = ? AND name = ? COLLATE NOCASE")
    .get(walletPubkey, name) as Contact;

  return NextResponse.json({ success: true, data: saved });
}
