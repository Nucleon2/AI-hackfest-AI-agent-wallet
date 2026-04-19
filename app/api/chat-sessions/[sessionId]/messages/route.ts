import { NextRequest, NextResponse } from "next/server";
import { getDb, type ChatMessageRow } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY ts ASC",
    args: [params.sessionId],
  });
  const messages = res.rows as unknown as ChatMessageRow[];
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

  const db = await getDb();
  const now = Date.now();

  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: `INSERT OR REPLACE INTO chat_messages (id, session_id, role, text, component, receipt_json, history_limit, ts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        msg.id,
        params.sessionId,
        typeof msg.role === "string" ? msg.role : "ai",
        typeof msg.text === "string" ? msg.text : null,
        typeof msg.component === "string" ? msg.component : null,
        typeof msg.receipt_json === "string" ? msg.receipt_json : null,
        typeof msg.history_limit === "number" ? msg.history_limit : null,
        typeof msg.ts === "number" ? msg.ts : now,
      ],
    });

    if (msg.role === "user" && typeof msg.text === "string" && msg.text) {
      const sessionRes = await tx.execute({
        sql: "SELECT title FROM chat_sessions WHERE id = ?",
        args: [params.sessionId],
      });
      const session = sessionRes.rows[0] as unknown as { title: string } | undefined;
      if (session?.title === "New Chat") {
        const title = msg.text.length > 40 ? msg.text.slice(0, 40) + "…" : msg.text;
        await tx.execute({
          sql: "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?",
          args: [title, now, params.sessionId],
        });
      } else {
        await tx.execute({
          sql: "UPDATE chat_sessions SET updated_at = ? WHERE id = ?",
          args: [now, params.sessionId],
        });
      }
    } else {
      await tx.execute({
        sql: "UPDATE chat_sessions SET updated_at = ? WHERE id = ?",
        args: [now, params.sessionId],
      });
    }

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  } finally {
    tx.close();
  }

  return NextResponse.json({ success: true, data: { id: msg.id } });
}
