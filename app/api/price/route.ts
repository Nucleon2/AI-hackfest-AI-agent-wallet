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

  const symbolToMint: Record<string, string> = {};
  for (const raw of tokenParams) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || symbolToMint[symbol]) continue;
    const info = getToken(symbol);
    if (!info) {
      return NextResponse.json(
        { success: false, error: `Unsupported token: ${raw}` },
        { status: 400 }
      );
    }
    symbolToMint[symbol] = info.mint;
  }

  const uniqueMints = Array.from(new Set(Object.values(symbolToMint)));
  const pricesByMint = await fetchTokenPrices(uniqueMints);
  const data: Record<string, number> = {};
  for (const [symbol, mint] of Object.entries(symbolToMint)) {
    data[symbol] = pricesByMint[mint] ?? 0;
  }

  return NextResponse.json({ success: true, data });
}
