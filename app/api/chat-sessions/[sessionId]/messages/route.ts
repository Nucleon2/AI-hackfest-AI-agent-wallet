import { NextRequest, NextResponse } from "next/server";
import { getDb, type ChatMessageRow } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const db = getDb();
  const messages = db
    .prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY ts ASC")
    .all(params.sessionId) as ChatMessageRow[];
  return NextResponse.json({ success: true, data: messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  let body: { message?: unknown };
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const m = body.message;
  if (!m || typeof m !== "object") {
    return NextResponse.json({ success: false, error: "message is required" }, { status: 400 });
  }
  const msg = m as Record<string, unknown>;
  if (typeof msg.id !== "string" || !msg.id) {
    return NextResponse.json({ success: false, error: "message.id is required" }, { status: 400 });
  }

  const db = getDb();
  const now = Date.now();

  const saveMessage = db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO chat_messages (id, session_id, role, text, component, receipt_json, history_limit, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      msg.id,
      params.sessionId,
      typeof msg.role === "string" ? msg.role : "ai",
      typeof msg.text === "string" ? msg.text : null,
      typeof msg.component === "string" ? msg.component : null,
      typeof msg.receipt_json === "string" ? msg.receipt_json : null,
      typeof msg.history_limit === "number" ? msg.history_limit : null,
      typeof msg.ts === "number" ? msg.ts : now,
    );

    // Auto-title from first user message
    if (msg.role === "user" && typeof msg.text === "string" && msg.text) {
      const session = db
        .prepare("SELECT title FROM chat_sessions WHERE id = ?")
        .get(params.sessionId) as { title: string } | undefined;
      if (session?.title === "New Chat") {
        const title = msg.text.length > 40 ? msg.text.slice(0, 40) + "…" : msg.text;
        db.prepare("UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?")
          .run(title, now, params.sessionId);
      } else {
        db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?")
          .run(now, params.sessionId);
      }
    } else {
      db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?")
        .run(now, params.sessionId);
    }
  });

  saveMessage();
  return NextResponse.json({ success: true, data: { id: msg.id } });
}
