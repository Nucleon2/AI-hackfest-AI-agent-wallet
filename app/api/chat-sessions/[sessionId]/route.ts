import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  let body: { title?: unknown };
  try {
    body = (await req.json()) as { title?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.title !== "string" || !body.title) {
    return NextResponse.json({ success: false, error: "title is required" }, { status: 400 });
  }
  const db = getDb();
  const result = db
    .prepare("UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?")
    .run(body.title, Date.now(), params.sessionId);
  if (result.changes === 0) {
    return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ success: false, error: "wallet is required" }, { status: 400 });
  }
  const db = getDb();
  const result = db
    .prepare("DELETE FROM chat_sessions WHERE id = ? AND wallet_pubkey = ?")
    .run(params.sessionId, wallet);
  if (result.changes === 0) {
    return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
