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

  const rows = getDb().prepare(sql).all(wallet) as PriceAlert[];
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

  const row: PriceAlert = {
    id: crypto.randomUUID(),
    wallet_pubkey: walletPubkey,
    token,
    target_price: alert.targetPrice,
    direction: alert.direction,
    is_triggered: 0,
    created_at: Date.now(),
    triggered_at: null,
  };

  getDb()
    .prepare(
      `INSERT INTO price_alerts
       (id, wallet_pubkey, token, target_price, direction, is_triggered, created_at, triggered_at)
       VALUES
       (@id, @wallet_pubkey, @token, @target_price, @direction, @is_triggered, @created_at, @triggered_at)`
    )
    .run(row);

  return NextResponse.json({ success: true, data: row });
}
