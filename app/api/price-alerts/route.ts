import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb } from "@/lib/db";
import { getToken } from "@/lib/tokenRegistry";
import { isIntent, type PriceAlert, type PriceAlertIntent } from "@/types/intent";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  const includeTriggered = req.nextUrl.searchParams.get("includeTriggered") === "1";
  if (!wallet) {
    return NextResponse.json(
      { success: false, error: "wallet query param required" },
      { status: 400 }
    );
  }
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid wallet pubkey" },
      { status: 400 }
    );
  }

  const sql = includeTriggered
    ? `SELECT * FROM price_alerts WHERE wallet_pubkey = ? ORDER BY created_at DESC`
    : `SELECT * FROM price_alerts WHERE wallet_pubkey = ? AND is_triggered = 0 ORDER BY created_at DESC`;

  const db = await getDb();
  const res = await db.execute({ sql, args: [wallet] });
  const rows = res.rows as unknown as PriceAlert[];
  return NextResponse.json({ success: true, data: rows });
}

interface CreateBody {
  intent?: unknown;
  walletPubkey?: unknown;
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { intent, walletPubkey } = body;
  if (typeof walletPubkey !== "string") {
    return NextResponse.json(
      { success: false, error: "walletPubkey required" },
      { status: 400 }
    );
  }
  try {
    new PublicKey(walletPubkey);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid walletPubkey" },
      { status: 400 }
    );
  }

  if (!isIntent(intent) || intent.action !== "price_alert") {
    return NextResponse.json(
      { success: false, error: "Invalid price alert intent" },
      { status: 400 }
    );
  }
  const alert = intent as PriceAlertIntent;

  const token = alert.token.toUpperCase();
  if (!getToken(token)) {
    return NextResponse.json(
      { success: false, error: `Unsupported token: ${token}` },
      { status: 400 }
    );
  }

  const actionType = alert.action_type ?? "notify";
  const swapFromToken = alert.swap_from_token?.toUpperCase() ?? null;
  const swapToToken = alert.swap_to_token?.toUpperCase() ?? null;

  if (actionType === "swap") {
    if (!swapFromToken || !swapToToken) {
      return NextResponse.json(
        { success: false, error: "swap_from_token and swap_to_token required for swap-type alerts" },
        { status: 400 }
      );
    }
    if (!getToken(swapFromToken)) {
      return NextResponse.json(
        { success: false, error: `Unsupported swap_from_token: ${swapFromToken}` },
        { status: 400 }
      );
    }
    if (!getToken(swapToToken)) {
      return NextResponse.json(
        { success: false, error: `Unsupported swap_to_token: ${swapToToken}` },
        { status: 400 }
      );
    }
    if (swapFromToken === swapToToken) {
      return NextResponse.json(
        { success: false, error: "swap_from_token and swap_to_token must be different" },
        { status: 400 }
      );
    }
    const hasPct = alert.swap_amount_pct != null;
    const hasFixed = alert.swap_amount_fixed != null;
    if (hasPct && hasFixed) {
      return NextResponse.json(
        { success: false, error: "Specify swap_amount_pct or swap_amount_fixed, not both" },
        { status: 400 }
      );
    }
    if (!hasPct && !hasFixed) {
      return NextResponse.json(
        { success: false, error: "swap_amount_pct or swap_amount_fixed required for swap-type alerts" },
        { status: 400 }
      );
    }
    if (hasPct && (alert.swap_amount_pct! <= 0 || alert.swap_amount_pct! > 100)) {
      return NextResponse.json(
        { success: false, error: "swap_amount_pct must be in (0, 100]" },
        { status: 400 }
      );
    }
    if (hasFixed && alert.swap_amount_fixed! <= 0) {
      return NextResponse.json(
        { success: false, error: "swap_amount_fixed must be > 0" },
        { status: 400 }
      );
    }
  }

  const row: PriceAlert = {
    id: crypto.randomUUID(),
    wallet_pubkey: walletPubkey,
    token,
    target_price: alert.targetPrice,
    direction: alert.direction,
    is_triggered: 0,
    created_at: Date.now(),
    triggered_at: null,
    action_type: actionType,
    swap_from_token: swapFromToken,
    swap_to_token: swapToToken,
    swap_amount_pct: alert.swap_amount_pct ?? null,
    swap_amount_fixed: alert.swap_amount_fixed ?? null,
    label: alert.label ?? null,
  };

  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO price_alerts
          (id, wallet_pubkey, token, target_price, direction, is_triggered, created_at, triggered_at,
           action_type, swap_from_token, swap_to_token, swap_amount_pct, swap_amount_fixed, label)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      row.id,
      row.wallet_pubkey,
      row.token,
      row.target_price,
      row.direction,
      row.is_triggered,
      row.created_at,
      row.triggered_at,
      row.action_type,
      row.swap_from_token,
      row.swap_to_token,
      row.swap_amount_pct,
      row.swap_amount_fixed,
      row.label,
    ],
  });

  return NextResponse.json({ success: true, data: row });
}
