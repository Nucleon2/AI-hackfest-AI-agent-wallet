import { NextRequest, NextResponse } from "next/server";
import { getDb, type ChatSessionRow } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ success: false, error: "wallet is required" }, { status: 400 });
  }
  const db = getDb();
  const sessions = db
    .prepare("SELECT * FROM chat_sessions WHERE wallet_pubkey = ? ORDER BY updated_at DESC")
    .all(wallet) as ChatSessionRow[];
  return NextResponse.json({ success: true, data: sessions });
}

export async function POST(req: NextRequest) {
  let body: { walletPubkey?: unknown; title?: unknown };
  try {
    body = (await req.json()) as { walletPubkey?: unknown; title?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.walletPubkey !== "string" || !body.walletPubkey) {
    return NextResponse.json({ success: false, error: "walletPubkey is required" }, { status: 400 });
  }
  const now = Date.now();
  const session: ChatSessionRow = {
    id: crypto.randomUUID(),
    wallet_pubkey: body.walletPubkey,
    title: typeof body.title === "string" && body.title ? body.title : "New Chat",
    created_at: now,
    updated_at: now,
  };
  getDb()
    .prepare(
      "INSERT INTO chat_sessions (id, wallet_pubkey, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(session.id, session.wallet_pubkey, session.title, session.created_at, session.updated_at);
  return NextResponse.json({ success: true, data: session });
}
