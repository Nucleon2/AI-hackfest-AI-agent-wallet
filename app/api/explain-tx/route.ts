import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { connection, SOLANA_NETWORK } from "@/lib/solanaClient";

export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a Solana transaction explainer. You will receive a JSON payload summarising one parsed Solana transaction plus the user's wallet address.

Your job: output STRICT JSON with exactly this shape and nothing else (no markdown, no preamble):
{
  "summary": string,       // ≤80 chars, one-line, past tense, mentions the user as "you"
  "explanation": string    // 2-4 sentences, plain English, no jargon
}

Guidelines:
- Identify the user's role (sender, receiver, swapper, nothing).
- Convert lamports to SOL (1 SOL = 1,000,000,000 lamports). Show at most 4 decimal places.
- Name the programs involved when useful:
  * 11111111111111111111111111111111 = System Program (native SOL transfer)
  * TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA = SPL Token Program (token transfer)
  * JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 or JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB = Jupiter (swap aggregator)
  * ComputeBudget111111111111111111111111111111 = Compute Budget (priority fee)
  * Stake11111111111111111111111111111111111111 = Stake Program
- State the fee explicitly in SOL.
- If the tx failed (err is not null), say so and briefly name the likely cause from the logs.
- Never speculate. If a movement is ambiguous, say "unclear" rather than guess.`;

interface ExplainBody {
  signature?: unknown;
  walletPubkey?: unknown;
}

interface CompactPayload {
  signature: string;
  walletPubkey: string;
  blockTime: number | null;
  slot: number;
  err: unknown;
  feeLamports: number;
  walletSolDelta: number | null;
  accountKeys: string[];
  preBalancesSol: number[];
  postBalancesSol: number[];
  programIds: string[];
  logMessages: string[];
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

  let body: ExplainBody;
  try {
    body = (await req.json()) as ExplainBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const signature =
    typeof body.signature === "string" ? body.signature.trim() : "";
  const walletPubkeyStr =
    typeof body.walletPubkey === "string" ? body.walletPubkey.trim() : "";

  if (!signature) {
    return NextResponse.json(
      { success: false, error: "signature is required." },
      { status: 400 }
    );
  }
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

  let tx;
  try {
    tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `RPC error: ${detail}` },
      { status: 502 }
    );
  }

  if (!tx) {
    return NextResponse.json(
      { success: false, error: "Transaction not found on this network." },
      { status: 404 }
    );
  }

  const ownerBase58 = walletPubkey.toBase58();
  const accountKeys = tx.transaction.message.accountKeys.map((k) =>
    k.pubkey.toBase58()
  );
  const ownerIdx = accountKeys.indexOf(ownerBase58);

  const preBalances = tx.meta?.preBalances ?? [];
  const postBalances = tx.meta?.postBalances ?? [];

  let walletSolDelta: number | null = null;
  if (
    ownerIdx >= 0 &&
    preBalances[ownerIdx] !== undefined &&
    postBalances[ownerIdx] !== undefined
  ) {
    walletSolDelta =
      (postBalances[ownerIdx] - preBalances[ownerIdx]) / LAMPORTS_PER_SOL;
  }

  const programIdSet = new Set<string>();
  for (const ix of tx.transaction.message.instructions) {
    const pid = (ix as { programId?: PublicKey }).programId;
    if (pid) programIdSet.add(pid.toBase58());
  }
  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions) {
      const pid = (ix as { programId?: PublicKey }).programId;
      if (pid) programIdSet.add(pid.toBase58());
    }
  }

  const payload: CompactPayload = {
    signature,
    walletPubkey: ownerBase58,
    blockTime: tx.blockTime ?? null,
    slot: tx.slot,
    err: tx.meta?.err ?? null,
    feeLamports: tx.meta?.fee ?? 0,
    walletSolDelta,
    accountKeys: accountKeys.slice(0, 10),
    preBalancesSol: preBalances
      .slice(0, 6)
      .map((b) => b / LAMPORTS_PER_SOL),
    postBalancesSol: postBalances
      .slice(0, 6)
      .map((b) => b / LAMPORTS_PER_SOL),
    programIds: Array.from(programIdSet),
    logMessages: (tx.meta?.logMessages ?? []).slice(-20),
  };

  const client = new Anthropic({ apiKey });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
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
          content: `<transaction>\n${JSON.stringify(payload, null, 2)}\n</transaction>`,
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

  const parsed = safeParse(extractText(response));
  let summary = "";
  let explanation = "";
  if (
    parsed &&
    typeof parsed === "object" &&
    typeof (parsed as Record<string, unknown>).summary === "string" &&
    typeof (parsed as Record<string, unknown>).explanation === "string"
  ) {
    summary = (parsed as Record<string, string>).summary;
    explanation = (parsed as Record<string, string>).explanation;
  } else {
    summary = "Transaction details";
    explanation =
      "I couldn't produce a clean explanation for this transaction. You can view it on Solscan for the raw breakdown.";
  }

  return NextResponse.json({
    success: true,
    data: {
      signature,
      summary,
      explanation,
      feeLamports: payload.feeLamports,
      feeSol: payload.feeLamports / LAMPORTS_PER_SOL,
      walletSolDelta,
      txSuccess: tx.meta?.err === null || tx.meta?.err === undefined,
      network: SOLANA_NETWORK,
      blockTime: payload.blockTime,
    },
  });
}
