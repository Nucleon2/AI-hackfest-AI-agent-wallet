import { NextRequest, NextResponse } from "next/server";
import { fetchTokenPrices } from "@/lib/portfolioManager";
import { getToken } from "@/lib/tokenRegistry";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const tokenParams = req.nextUrl.searchParams.getAll("token");
  if (tokenParams.length === 0) {
    return NextResponse.json(
      { success: false, error: "token query param required" },
      { status: 400 }
    );
  }

  const mints: string[] = [];
  const symbolToMint: Record<string, string> = {};
  for (const symbol of tokenParams) {
    const info = getToken(symbol);
    if (!info) {
      return NextResponse.json(
        { success: false, error: `Unsupported token: ${symbol}` },
        { status: 400 }
      );
    }
    mints.push(info.mint);
    symbolToMint[symbol.toUpperCase()] = info.mint;
  }

  const pricesByMint = await fetchTokenPrices(mints);
  const data: Record<string, number> = {};
  for (const [symbol, mint] of Object.entries(symbolToMint)) {
    data[symbol] = pricesByMint[mint] ?? 0;
  }

  return NextResponse.json({ success: true, data });
}
