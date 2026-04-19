import { NextRequest, NextResponse } from "next/server";
import { getDb, type PortfolioConfigRow } from "@/lib/db";
import type { PortfolioConfig, PortfolioTarget } from "@/types/intent";
import type { InValue } from "@libsql/client";

export const runtime = "nodejs";

function rowToConfig(row: PortfolioConfigRow): PortfolioConfig {
  return {
    id: row.id,
    wallet_pubkey: row.wallet_pubkey,
    targets: JSON.parse(row.targets) as PortfolioTarget[],
    drift_threshold: row.drift_threshold,
    is_active: row.is_active === 1,
    auto_execute: row.auto_execute === 1,
    last_rebalanced_at: row.last_rebalanced_at,
    created_at: row.created_at,
  };
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ success: false, error: "wallet is required" }, { status: 400 });
  }
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM portfolio_configs WHERE wallet_pubkey = ?",
    args: [wallet],
  });
  const row = res.rows[0] as unknown as PortfolioConfigRow | undefined;

  return NextResponse.json({ success: true, data: row ? rowToConfig(row) : null });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const walletPubkey = typeof b.walletPubkey === "string" ? b.walletPubkey : null;
  if (!walletPubkey) {
    return NextResponse.json({ success: false, error: "walletPubkey is required" }, { status: 400 });
  }

  if (!Array.isArray(b.targets) || b.targets.length === 0) {
    return NextResponse.json({ success: false, error: "targets must be a non-empty array" }, { status: 400 });
  }

  const targets = b.targets as PortfolioTarget[];
  const sum = targets.reduce((acc, t) => acc + t.percentage, 0);
  if (Math.abs(sum - 100) > 1.5) {
    return NextResponse.json(
      { success: false, error: `Target percentages must sum to 100 (got ${sum.toFixed(1)})` },
      { status: 400 }
    );
  }

  const drift_threshold = typeof b.drift_threshold === "number" ? b.drift_threshold : 5.0;
  const auto_execute = b.auto_execute === true ? 1 : 0;
  const now = Date.now();
  const id = crypto.randomUUID();

  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO portfolio_configs (id, wallet_pubkey, targets, drift_threshold, is_active, auto_execute, last_rebalanced_at, created_at)
          VALUES (?, ?, ?, ?, 1, ?, NULL, ?)
          ON CONFLICT(wallet_pubkey) DO UPDATE SET
            targets = excluded.targets,
            drift_threshold = excluded.drift_threshold,
            is_active = 1,
            auto_execute = excluded.auto_execute`,
    args: [id, walletPubkey, JSON.stringify(targets), drift_threshold, auto_execute, now],
  });

  const res = await db.execute({
    sql: "SELECT * FROM portfolio_configs WHERE wallet_pubkey = ?",
    args: [walletPubkey],
  });
  const row = res.rows[0] as unknown as PortfolioConfigRow;

  return NextResponse.json({ success: true, data: rowToConfig(row) });
}

export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const walletPubkey = typeof b.walletPubkey === "string" ? b.walletPubkey : null;
  if (!walletPubkey) {
    return NextResponse.json({ success: false, error: "walletPubkey is required" }, { status: 400 });
  }

  const sets: string[] = [];
  const args: InValue[] = [];

  if (typeof b.is_active === "boolean" || typeof b.is_active === "number") {
    sets.push("is_active = ?");
    args.push(b.is_active ? 1 : 0);
  }
  if (typeof b.auto_execute === "boolean" || typeof b.auto_execute === "number") {
    sets.push("auto_execute = ?");
    args.push(b.auto_execute ? 1 : 0);
  }
  if (typeof b.drift_threshold === "number") {
    sets.push("drift_threshold = ?");
    args.push(b.drift_threshold);
  }
  if (typeof b.last_rebalanced_at === "number") {
    sets.push("last_rebalanced_at = ?");
    args.push(b.last_rebalanced_at);
  }

  if (sets.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  args.push(walletPubkey);
  const db = await getDb();
  await db.execute({
    sql: `UPDATE portfolio_configs SET ${sets.join(", ")} WHERE wallet_pubkey = ?`,
    args,
  });

  const res = await db.execute({
    sql: "SELECT * FROM portfolio_configs WHERE wallet_pubkey = ?",
    args: [walletPubkey],
  });
  const row = res.rows[0] as unknown as PortfolioConfigRow | undefined;

  return NextResponse.json({ success: true, data: row ? rowToConfig(row) : null });
}

export async function DELETE(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ success: false, error: "wallet is required" }, { status: 400 });
  }
  const db = await getDb();
  await db.execute({
    sql: "UPDATE portfolio_configs SET is_active = 0 WHERE wallet_pubkey = ?",
    args: [wallet],
  });
  return NextResponse.json({ success: true });
}
