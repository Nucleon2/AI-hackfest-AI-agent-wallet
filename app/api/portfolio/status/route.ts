import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb, type PortfolioConfigRow } from "@/lib/db";
import { connection } from "@/lib/solanaClient";
import { TOKEN_REGISTRY } from "@/lib/tokenRegistry";
import {
  fetchTokenPrices,
  fetchTokenBalances,
  calculateAllocations,
} from "@/lib/portfolioManager";
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

  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM portfolio_configs WHERE wallet_pubkey = ? AND is_active = 1",
    args: [wallet],
  });
  const row = res.rows[0] as unknown as PortfolioConfigRow | undefined;

  if (!row) {
    return NextResponse.json({ success: true, data: null });
  }

  const config = rowToConfig(row);
  const tokens = config.targets.map((t) => t.token);
  const mints = tokens.map((t) => TOKEN_REGISTRY[t]?.mint).filter(Boolean) as string[];

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(wallet);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid wallet address" }, { status: 400 });
  }

  try {
    const [prices, balances] = await Promise.all([
      fetchTokenPrices(mints),
      fetchTokenBalances(pubkey, connection, tokens),
    ]);

    const { allocations, totalValueUsd } = calculateAllocations(balances, prices, config.targets);
    const maxDrift = allocations.reduce((max, a) => Math.max(max, Math.abs(a.drift)), 0);
    const needsRebalance = maxDrift >= config.drift_threshold;

    return NextResponse.json({
      success: true,
      data: {
        allocations,
        totalValueUsd,
        maxDrift,
        needsRebalance,
        config,
        fetchedAt: Date.now(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch portfolio status";
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
