import { NextRequest, NextResponse } from "next/server";
import { getDb, type PortfolioConfigRow } from "@/lib/db";
import type { PortfolioConfig, PortfolioTarget } from "@/types/intent";

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
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM portfolio_configs WHERE wallet_pubkey = ?")
    .get(wallet) as PortfolioConfigRow | undefined;

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

  const db = getDb();
  db.prepare(`
    INSERT INTO portfolio_configs (id, wallet_pubkey, targets, drift_threshold, is_active, auto_execute, last_rebalanced_at, created_at)
    VALUES (?, ?, ?, ?, 1, ?, NULL, ?)
    ON CONFLICT(wallet_pubkey) DO UPDATE SET
      targets = excluded.targets,
      drift_threshold = excluded.drift_threshold,
      is_active = 1,
      auto_execute = excluded.auto_execute
  `).run(id, walletPubkey, JSON.stringify(targets), drift_threshold, auto_execute, now);

  const row = db
    .prepare("SELECT * FROM portfolio_configs WHERE wallet_pubkey = ?")
    .get(walletPubkey) as PortfolioConfigRow;

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

  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (typeof b.is_active === "boolean" || typeof b.is_active === "number") {
    sets.push("is_active = ?");
    params.push(b.is_active ? 1 : 0);
  }
  if (typeof b.auto_execute === "boolean" || typeof b.auto_execute === "number") {
    sets.push("auto_execute = ?");
    params.push(b.auto_execute ? 1 : 0);
  }
  if (typeof b.drift_threshold === "number") {
    sets.push("drift_threshold = ?");
    params.push(b.drift_threshold);
  }
  if (typeof b.last_rebalanced_at === "number") {
    sets.push("last_rebalanced_at = ?");
    params.push(b.last_rebalanced_at);
  }

  if (sets.length === 0) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  params.push(walletPubkey);
  db.prepare(`UPDATE portfolio_configs SET ${sets.join(", ")} WHERE wallet_pubkey = ?`).run(...params);

  const row = db
    .prepare("SELECT * FROM portfolio_configs WHERE wallet_pubkey = ?")
    .get(walletPubkey) as PortfolioConfigRow | undefined;

  return NextResponse.json({ success: true, data: row ? rowToConfig(row) : null });
}

export async function DELETE(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ success: false, error: "wallet is required" }, { status: 400 });
  }
  const db = getDb();
  db.prepare("UPDATE portfolio_configs SET is_active = 0 WHERE wallet_pubkey = ?").run(wallet);
  return NextResponse.json({ success: true });
}
