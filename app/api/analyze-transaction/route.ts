import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are an on-chain security analyst for a Solana wallet. You receive a pre-flight transaction context describing what a transaction will do BEFORE the user signs it.

Your job: output STRICT JSON matching exactly this shape and nothing else (no markdown, no preamble):
{
  "riskLevel": "safe" | "caution" | "danger",
  "riskScore": number,
  "action": string,
  "programName": string,
  "warnings": string[],
  "summary": string
}

Field rules:
- riskLevel:
  * "danger" — unknown program IDs, token approvals to unverified addresses, amount > 50 SOL, priceImpact > 2%, or draining >90% of wallet balance
  * "caution" — amount 10–50 SOL, priceImpact 0.5–2%, first-time recipient pattern, unknown route labels
  * "safe" — known programs (System Program, Jupiter, Marinade, Jito), small amounts, minimal impact
- riskScore: integer 0–100 matching the riskLevel (safe=0–29, caution=30–69, danger=70–100)
- action: human-readable action like "SOL Transfer", "Token Swap", "Liquid Stake", "Unstake"
- programName: identify by context ("System Program", "Jupiter Aggregator", "Marinade Finance", "Jito Liquid Staking")
- warnings: array of specific, actionable concerns — empty array [] if safe
- summary: single sentence ≤80 chars, present tense, describes what the transaction does`;

export interface TxAnalysis {
  riskLevel: "safe" | "caution" | "danger";
  riskScore: number;
  action: string;
  programName: string;
  warnings: string[];
  summary: string;
}

type TxContext =
  | { type: "send"; amount: number; token: string; recipientPubkey: string; programId: string }
  | { type: "swap"; fromToken: string; toToken: string; amount: number; priceImpact: number; routeLabels: string[] }
  | { type: "stake"; amount: number; provider: string };

interface AnalyzeTxBody {
  txContext: TxContext;
  walletPubkey: string;
  solBalance: number;
}

const SAFE_BASELINE: TxAnalysis = {
  riskLevel: "safe",
  riskScore: 0,
  action: "Transaction",
  programName: "Unknown",
  warnings: [],
  summary: "Analysis unavailable — proceeding with caution.",
};

function safeParse(text: string): TxAnalysis {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (
      typeof parsed.riskLevel === "string" &&
      ["safe", "caution", "danger"].includes(parsed.riskLevel) &&
      typeof parsed.riskScore === "number" &&
      typeof parsed.action === "string" &&
      typeof parsed.programName === "string" &&
      Array.isArray(parsed.warnings) &&
      typeof parsed.summary === "string"
    ) {
      return parsed as unknown as TxAnalysis;
    }
  } catch {
    // fall through
  }
  return SAFE_BASELINE;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: true, data: SAFE_BASELINE });
  }

  let body: AnalyzeTxBody;
  try {
    body = (await req.json()) as AnalyzeTxBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { txContext, walletPubkey, solBalance } = body;
  if (!txContext || !walletPubkey) {
    return NextResponse.json({ success: false, error: "txContext and walletPubkey required" }, { status: 400 });
  }

  let analysis: TxAnalysis = SAFE_BASELINE;

  try {
    const client = new Anthropic({ apiKey });
    const userContent = JSON.stringify({ txContext, walletSolBalance: solBalance });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `<transaction>\n${userContent}\n</transaction>` }],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    analysis = safeParse(text);
  } catch {
    return NextResponse.json({ success: true, data: SAFE_BASELINE });
  }

  // Log caution and danger to threat_log
  if (analysis.riskLevel !== "safe") {
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO threat_log (id, wallet_pubkey, tx_context, risk_level, analysis_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        walletPubkey,
        JSON.stringify(txContext),
        analysis.riskLevel,
        JSON.stringify(analysis),
        Date.now()
      );
    } catch {
      // DB write failure must not block signing
    }
  }

  return NextResponse.json({ success: true, data: analysis });
}
