import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { connection, SOLANA_NETWORK } from "@/lib/solanaClient";

export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const SYSTEM_PROMPT = `You are a Solana spending-insights analyst. You will receive a JSON payload with up to 20 recent transactions for one wallet, plus pre-computed totals. Your job is to categorise them and narrate spending patterns.

Respond with STRICT JSON only (no markdown, no preamble) using this exact shape:
{
  "categories": [
    { "name": string, "count": integer, "totalSol": number }
  ],
  "topRecipients": [
    { "address": string, "count": integer, "totalSol": number }
  ],
  "biggestTx": {
    "signature": string,
    "solAmount": number,
    "note": string
  } | null,
  "narrative": string
}

Rules:
- Category "name" MUST be one of: "transfer_sent", "transfer_received", "swap", "fee_only", "stake", "other".
- Sum transactions into categories based on the provided data:
  * transfer_sent: user lost SOL via System Program (solDelta clearly negative, only System Program involved).
  * transfer_received: user gained SOL via System Program.
  * swap: any tx involving Jupiter program IDs (JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 or JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB).
  * fee_only: solDelta equals -fee (tiny) and no transfer happened (e.g. failed or a no-op).
  * stake: any tx involving Stake11111111111111111111111111111111111111.
  * other: everything else.
- totalSol in each category is the SUM OF ABSOLUTE VALUES of solDelta for those txs (so 0.1 SOL sent = 0.1, not -0.1).
- topRecipients: up to 3 addresses the user sent SOL to most frequently (by count). Use the 'otherAccount' field. Skip when no clear recipient.
- biggestTx: the single tx with the largest |solDelta|. note is a ≤60-char one-line description. Set to null if all txs have near-zero deltas.
- narrative: 2-3 friendly sentences summarising activity. Use totals from the payload, not numbers you invent. Address the user as "you".
- Use ONLY the data in the payload — do not hallucinate. If data is missing, omit the field (for categories, only include ones with count > 0).`;

interface InsightsBody {
  walletPubkey?: unknown;
  limit?: unknown;
}

const JUPITER_IDS = new Set([
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",
]);
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const STAKE_PROGRAM_ID = "Stake11111111111111111111111111111111111111";

interface CompactTx {
  signature: string;
  blockTime: number | null;
  success: boolean;
  solDelta: number;
  feeSol: number;
  otherAccount: string | null;
  programIds: string[];
}

function extractText(message: Anthropic.Message): string {
  for (const block of message.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 }
    );
  }

  let body: InsightsBody;
  try {
    body = (await req.json()) as InsightsBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const walletPubkeyStr =
    typeof body.walletPubkey === "string" ? body.walletPubkey.trim() : "";
  if (!walletPubkeyStr) {
    return NextResponse.json(
      { success: false, error: "walletPubkey is required." },
      { status: 400 }
    );
  }

  let walletPubkey: PublicKey;
  try {
    walletPubkey = new PublicKey(walletPubkeyStr);
  } catch {
    return NextResponse.json(
      { success: false, error: "walletPubkey is not a valid Solana address." },
      { status: 400 }
    );
  }

  const requestedLimit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.floor(body.limit)
      : DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, requestedLimit));

  let sigs;
  try {
    sigs = await connection.getSignaturesForAddress(walletPubkey, { limit });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `RPC error: ${detail}` },
      { status: 502 }
    );
  }

  if (sigs.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        categories: [],
        topRecipients: [],
        biggestTx: null,
        narrative:
          "No transactions yet on this wallet. Once you start using it, your spending breakdown will appear here.",
        totalSolOut: 0,
        totalSolIn: 0,
        totalFeePaidSol: 0,
        txCount: 0,
        network: SOLANA_NETWORK,
      },
    });
  }

  const parsed = await Promise.all(
    sigs.map((s) =>
      connection
        .getParsedTransaction(s.signature, {
          maxSupportedTransactionVersion: 0,
        })
        .catch(() => null)
    )
  );

  const ownerBase58 = walletPubkey.toBase58();
  const compact: CompactTx[] = [];
  let totalSolOut = 0;
  let totalSolIn = 0;
  let totalFeePaidSol = 0;

  for (let i = 0; i < sigs.length; i += 1) {
    const sig = sigs[i];
    const tx = parsed[i];
    if (!tx) continue;

    const keys = tx.transaction.message.accountKeys;
    const ownerIdx = keys.findIndex((k) => k.pubkey.toBase58() === ownerBase58);

    const preBalances = tx.meta?.preBalances ?? [];
    const postBalances = tx.meta?.postBalances ?? [];
    let solDelta = 0;
    if (
      ownerIdx >= 0 &&
      preBalances[ownerIdx] !== undefined &&
      postBalances[ownerIdx] !== undefined
    ) {
      solDelta =
        (postBalances[ownerIdx] - preBalances[ownerIdx]) / LAMPORTS_PER_SOL;
    }

    const feeSol = (tx.meta?.fee ?? 0) / LAMPORTS_PER_SOL;

    // Owner pays the fee only if they are the fee payer (account index 0).
    if (ownerIdx === 0) {
      totalFeePaidSol += feeSol;
    }
    if (solDelta < 0) totalSolOut += -solDelta;
    else if (solDelta > 0) totalSolIn += solDelta;

    const otherAccount =
      keys.find((k) => k.pubkey.toBase58() !== ownerBase58)?.pubkey.toBase58() ??
      null;

    const programIdSet = new Set<string>();
    for (const ix of tx.transaction.message.instructions) {
      const pid = (ix as { programId?: PublicKey }).programId;
      if (pid) programIdSet.add(pid.toBase58());
    }

    compact.push({
      signature: sig.signature,
      blockTime: sig.blockTime ?? null,
      success: sig.err === null,
      solDelta,
      feeSol,
      otherAccount,
      programIds: Array.from(programIdSet),
    });
  }

  const claudePayload = {
    walletPubkey: ownerBase58,
    txCount: compact.length,
    totalSolOut,
    totalSolIn,
    totalFeePaidSol,
    knownPrograms: {
      system: SYSTEM_PROGRAM_ID,
      stake: STAKE_PROGRAM_ID,
      jupiter: Array.from(JUPITER_IDS),
    },
    transactions: compact,
  };

  const client = new Anthropic({ apiKey });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `<payload>\n${JSON.stringify(claudePayload, null, 2)}\n</payload>`,
        },
      ],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Claude request failed: ${detail}` },
      { status: 502 }
    );
  }

  const claudeParsed = safeParse(extractText(response));
  const fallback = {
    categories: [],
    topRecipients: [],
    biggestTx: null,
    narrative:
      "I couldn't analyse these transactions cleanly. Try again in a moment.",
  };
  const result =
    claudeParsed && typeof claudeParsed === "object" ? claudeParsed : fallback;

  return NextResponse.json({
    success: true,
    data: {
      ...(result as Record<string, unknown>),
      totalSolOut,
      totalSolIn,
      totalFeePaidSol,
      txCount: compact.length,
      network: SOLANA_NETWORK,
    },
  });
}
