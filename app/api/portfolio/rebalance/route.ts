import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb, type PortfolioConfigRow } from "@/lib/db";
import { connection } from "@/lib/solanaClient";
import { TOKEN_REGISTRY } from "@/lib/tokenRegistry";
import {
  fetchTokenPrices,
  fetchTokenBalances,
  calculateAllocations,
  buildRebalanceSwaps,
  askClaudeForRebalance,
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

  const db = getDb();
  const row = db
    .prepare("SELECT * FROM portfolio_configs WHERE wallet_pubkey = ? AND is_active = 1")
    .get(walletPubkey) as PortfolioConfigRow | undefined;

  if (!row) {
    return NextResponse.json({ success: false, error: "No active portfolio config found" }, { status: 404 });
  }

  const config = rowToConfig(row);
  const tokens = config.targets.map((t) => t.token);
  const mints = tokens.map((t) => TOKEN_REGISTRY[t]?.mint).filter(Boolean) as string[];

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(walletPubkey);
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

    if (maxDrift < config.drift_threshold) {
      return NextResponse.json({
        success: true,
        data: {
          needsRebalance: false,
          maxDrift,
          reasoning: `Portfolio is within the ${config.drift_threshold}% drift threshold (max drift: ${maxDrift.toFixed(1)}%)`,
          swaps: [],
        },
      });
    }

    const status = {
      allocations,
      totalValueUsd,
      maxDrift,
      needsRebalance: true,
      config,
      fetchedAt: Date.now(),
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    let swaps;
    let reasoning: string;

    if (apiKey) {
      const result = await askClaudeForRebalance(status, apiKey);
      swaps = result.swaps;
      reasoning = result.reasoning;
    } else {
      swaps = buildRebalanceSwaps(
        allocations,
        totalValueUsd,
        Object.fromEntries(mints.map((m, i) => [m, prices[m] ?? 0]))
      );
      reasoning = "Algorithmic rebalancing (no API key for Claude)";
    }

    return NextResponse.json({
      success: true,
      data: { needsRebalance: true, swaps, reasoning, status },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to compute rebalance";
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
