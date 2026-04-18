import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { isIntent, type Intent, type WalletContext } from "@/types/intent";

export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are an intent parser for a Solana crypto wallet.
Your ONLY job is to convert the user's natural language message into a structured JSON intent object.

Rules:
- Always respond with valid JSON only. No markdown, no explanation, no preamble.
- Supported actions: "send", "swap", "balance", "history", "unknown", "schedule", "view_schedules", "cancel_schedule", "save_contact", "list_contacts", "delete_contact", "set_portfolio", "view_portfolio", "pause_portfolio", "resume_portfolio", "set_drift_threshold", "stake", "unstake", "staking_status"
- For "send": extract amount (number), token (string, uppercase), recipient (string). If recipient looks like a contact name (not a valid Solana base58 address), still include it as-is — the frontend will resolve it against the address book.
- For "swap": extract fromToken, toToken, amount. Default slippageBps to 50 if not specified.
- For "balance": if the user asks about a specific token, include it. Otherwise omit token field.
- For "history": extract limit if mentioned, default to 5.
- If the intent is unclear or unsupported, return action "unknown" with a clarification message.
- Token amounts: always return as a number. "five" = 5, "half a SOL" = 0.5.
- Token names: always uppercase. "sol" = "SOL", "usdc" = "USDC".

For "schedule": the user wants to set up a future or recurring payment.
  Extract: amount (number), token (uppercase string), recipient (string), frequency ("once"|"daily"|"weekly"|"monthly").
  For weekly: also extract day_of_week as lowercase English day name (e.g. "friday").
  For "once": extract scheduled_date as ISO date "YYYY-MM-DD" for specific dates, or "in N minutes" / "in N hours" / "in N days" for relative times.
  Always generate a short human-readable label field (e.g. "Every Friday", "April 25th", "In 1 day").
  Examples:
    "Send 10 USDC to ABC every Friday"
      -> { "action": "schedule", "amount": 10, "token": "USDC", "recipient": "ABC", "frequency": "weekly", "day_of_week": "friday", "label": "Every Friday" }
    "Send 0.5 SOL to XYZ in one day"
      -> { "action": "schedule", "amount": 0.5, "token": "SOL", "recipient": "XYZ", "frequency": "once", "scheduled_date": "in 1 day", "label": "In 1 day" }
    "Send 0.2 SOL to XYZ in 30 minutes"
      -> { "action": "schedule", "amount": 0.2, "token": "SOL", "recipient": "XYZ", "frequency": "once", "scheduled_date": "in 30 minutes", "label": "In 30 minutes" }
    "Send 5 SOL to XYZ on April 25"
      -> { "action": "schedule", "amount": 5, "token": "SOL", "recipient": "XYZ", "frequency": "once", "scheduled_date": "2026-04-25", "label": "April 25th" }
    "Send 2 SOL to XYZ every month"
      -> { "action": "schedule", "amount": 2, "token": "SOL", "recipient": "XYZ", "frequency": "monthly", "label": "Every month" }
    "Pay ABC 10 USDC every day"
      -> { "action": "schedule", "amount": 10, "token": "USDC", "recipient": "ABC", "frequency": "daily", "label": "Every day" }

For "view_schedules": user wants to see their scheduled/recurring payments.
  Triggers: "show my scheduled payments", "list schedules", "what recurring sends do I have", "my scheduled payments".
  -> { "action": "view_schedules" }

For "cancel_schedule": user wants to cancel a scheduled payment.
  Extract a description of what they said so the frontend can show them their list.
  -> { "action": "cancel_schedule", "description": "friday USDC payment" }

For "save_contact": user wants to save a wallet address under a human-readable name.
  Triggers: "save [address] as [name]", "add [name]: [address]", "remember [address] as [name]", "store [address] as [name]".
  Extract: name (the human label), address (the raw Solana address).
  -> { "action": "save_contact", "name": "Alice", "address": "7xK...abc" }

For "list_contacts": user wants to see their saved contacts.
  Triggers: "show my contacts", "list contacts", "who are my contacts", "show address book", "my saved wallets".
  -> { "action": "list_contacts" }

For "delete_contact": user wants to remove a saved contact.
  Triggers: "delete [name] from contacts", "remove [name]", "forget [name]", "delete contact [name]".
  Extract: name (the contact name to remove).
  -> { "action": "delete_contact", "name": "Alice" }

For "set_portfolio": the user wants to set target portfolio allocations for auto-rebalancing.
  Triggers: "keep my portfolio X% SOL Y% USDC", "set portfolio to X% SOL", "allocate X% SOL Y% USDC Z% BONK", "maintain portfolio balance X% SOL", "rebalance my portfolio X% SOL".
  Extract: targets (array of {token, percentage}), optional drift_threshold (number, default 5), optional auto_execute (boolean, default false).
  CRITICAL: percentages MUST sum to 100. If they don't, return action "unknown" with clarification asking the user to ensure they sum to 100.
  All token names uppercase.
  Examples:
    "keep my portfolio 60% SOL 30% USDC 10% BONK"
      -> { "action": "set_portfolio", "targets": [{"token": "SOL", "percentage": 60}, {"token": "USDC", "percentage": 30}, {"token": "BONK", "percentage": 10}] }
    "60% SOL 40% USDC with 3% drift threshold"
      -> { "action": "set_portfolio", "targets": [{"token": "SOL", "percentage": 60}, {"token": "USDC", "percentage": 40}], "drift_threshold": 3 }

For "view_portfolio": user wants to see their current portfolio vs target allocations.
  Triggers: "show my portfolio", "portfolio status", "how is my portfolio doing", "check portfolio balance", "portfolio allocation", "show portfolio manager", "portfolio rebalance status".
  -> { "action": "view_portfolio" }

For "pause_portfolio": user wants to pause automatic rebalancing.
  Triggers: "pause rebalancing", "stop portfolio manager", "disable auto rebalance", "pause portfolio", "stop rebalancing".
  -> { "action": "pause_portfolio" }

For "resume_portfolio": user wants to resume automatic rebalancing.
  Triggers: "resume rebalancing", "start portfolio manager", "enable auto rebalance", "resume portfolio", "turn on rebalancing".
  -> { "action": "resume_portfolio" }

For "set_drift_threshold": user wants to change how sensitive the rebalancing trigger is.
  Triggers: "set drift threshold to X%", "rebalance when drift exceeds X%", "change rebalance sensitivity to X%", "trigger rebalance at X%".
  Extract: threshold (number, percentage value, e.g. 3 for 3%).
  -> { "action": "set_drift_threshold", "threshold": 3 }

For "stake": user wants to liquid-stake SOL and receive mSOL (Marinade) or JitoSOL (Jito).
  Extract: amount (number, SOL), provider ("marinade" default; "jito" only if the user names Jito or JitoSOL).
  Triggers: "stake X SOL", "stake X SOL with Jito", "liquid stake X SOL", "earn yield on X SOL".
  Examples:
    "stake 5 SOL"
      -> { "action": "stake", "amount": 5, "provider": "marinade" }
    "stake 5 SOL with Jito"
      -> { "action": "stake", "amount": 5, "provider": "jito" }
    "liquid stake 0.5 SOL"
      -> { "action": "stake", "amount": 0.5, "provider": "marinade" }

For "unstake": user wants to redeem mSOL/JitoSOL back to SOL via the liquid unstake pool.
  Extract: amount (number in the liquid token units, or null to unstake the full balance),
           provider ("marinade" for mSOL, "jito" for JitoSOL; infer from the token the user names).
  Triggers: "unstake my mSOL", "unstake 2 mSOL", "redeem my staked SOL", "unstake all JitoSOL".
  Examples:
    "unstake my mSOL"
      -> { "action": "unstake", "amount": null, "provider": "marinade" }
    "unstake 2 mSOL"
      -> { "action": "unstake", "amount": 2, "provider": "marinade" }
    "unstake all JitoSOL"
      -> { "action": "unstake", "amount": null, "provider": "jito" }

For "staking_status": user wants to see their current staking position, APY, and yield.
  Triggers: "how much yield am I earning?", "show my staking", "what's my APY?", "staking status", "my staked SOL".
  -> { "action": "staking_status" }

For "multi_step": the user has chained 2+ actions with "then", "and then", "after that", "followed by", or similar connective language. Each step executes sequentially and the output of one may feed into the next.

Step types inside multi_step:
  - { "type": "swap", "fromToken": "USDC", "toToken": "SOL", "amount": 50, "slippageBps": 50 }
  - { "type": "send", "amount": null, "token": "SOL", "recipient": "<address or contact name>", "memo": null }
    Set amount to null when the send should use the received amount from the previous swap step.
    Set amount to a concrete number when the user specified a fixed amount for the send.
  - { "type": "history", "limit": 5 }
  - { "type": "balance" }

Rules for multi_step:
  - Only return multi_step when there are clearly 2+ sequential actions.
  - Generate a short English "description" field summarising the whole chain (e.g. "Swap 50 USDC to SOL then send to Ahmad").
  - Maximum supported steps: 4.
  - If any step has an unclear recipient or amount that cannot be chained, return action "unknown" with a clarification.
  - If recipient looks like a contact name (not a base58 address), include it as-is — the frontend will resolve it.
  - multi_step supports steps of type "swap", "send", "history", or "balance".
  - "history" and "balance" are display steps — they execute instantly without a confirmation prompt.
  - Use multi_step whenever the user asks to do 2+ things in one message, including mixing display steps with transactions.

Examples:
  "Swap 50 USDC to SOL then send it to Ahmad"
  -> { "action": "multi_step", "description": "Swap 50 USDC to SOL, then send to Ahmad", "steps": [
       { "type": "swap", "fromToken": "USDC", "toToken": "SOL", "amount": 50, "slippageBps": 50 },
       { "type": "send", "amount": null, "token": "SOL", "recipient": "Ahmad", "memo": null }
     ]}

  "Swap 10 USDC to SOL then send 0.5 SOL to Bob"
  -> { "action": "multi_step", "description": "Swap 10 USDC to SOL, then send 0.5 SOL to Bob", "steps": [
       { "type": "swap", "fromToken": "USDC", "toToken": "SOL", "amount": 10, "slippageBps": 50 },
       { "type": "send", "amount": 0.5, "token": "SOL", "recipient": "Bob", "memo": null }
     ]}

Wallet context will be provided in the user message. Use it to resolve relative amounts like "half my SOL".`;

interface ParseBody {
  message?: unknown;
  walletContext?: unknown;
  conversationHistory?: unknown;
}

type AnthropicMessage = { role: "user" | "assistant"; content: string };

function toConversationHistory(value: unknown): AnthropicMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is AnthropicMessage =>
      typeof item === "object" &&
      item !== null &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" &&
      item.content.trim().length > 0
  );
}

function buildClaudeMessages(
  history: AnthropicMessage[],
  currentUserContent: string
): AnthropicMessage[] {
  // Ensure messages strictly alternate user/assistant starting with user
  const result: AnthropicMessage[] = [];
  let expect: "user" | "assistant" = "user";
  for (const msg of history) {
    if (msg.role === expect) {
      result.push(msg);
      expect = expect === "user" ? "assistant" : "user";
    }
  }
  result.push({ role: "user", content: currentUserContent });
  return result;
}

function toWalletContext(value: unknown): WalletContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const ctx: WalletContext = {};
  if (typeof v.publicKey === "string") ctx.publicKey = v.publicKey;
  if (typeof v.solBalance === "number") ctx.solBalance = v.solBalance;
  return Object.keys(ctx).length > 0 ? ctx : undefined;
}

function buildUserMessage(message: string, ctx: WalletContext | undefined) {
  if (!ctx) return message;
  return `${message}\n\n<wallet_context>\n${JSON.stringify(ctx, null, 2)}\n</wallet_context>`;
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
      {
        success: false,
        error:
          "ANTHROPIC_API_KEY is not configured. Add it to .env.local and restart the dev server.",
      },
      { status: 500 }
    );
  }

  let body: ParseBody;
  try {
    body = (await req.json()) as ParseBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json(
      { success: false, error: "message is required." },
      { status: 400 }
    );
  }

  const walletContext = toWalletContext(body.walletContext);
  const conversationHistory = toConversationHistory(body.conversationHistory);
  const client = new Anthropic({ apiKey });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 768,
      system: SYSTEM_PROMPT,
      messages: buildClaudeMessages(
        conversationHistory,
        buildUserMessage(message, walletContext)
      ),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Claude request failed: ${detail}` },
      { status: 502 }
    );
  }

  const parsed = safeParse(extractText(response));

  if (
    parsed &&
    typeof parsed === "object" &&
    (parsed as Record<string, unknown>).action === "multi_step"
  ) {
    const steps = (parsed as Record<string, unknown>).steps;
    const validStepTypes = ["swap", "send", "history", "balance"];
    const allValid =
      Array.isArray(steps) &&
      steps.every(
        (s: unknown) =>
          typeof s === "object" &&
          s !== null &&
          validStepTypes.includes((s as Record<string, unknown>).type as string)
      );
    if (!allValid) {
      return NextResponse.json({
        success: true,
        data: {
          action: "unknown",
          clarification:
            "I can only chain swap and send actions together. For balance or history, please ask that separately first.",
        },
      });
    }
  }

  const intent: Intent = isIntent(parsed)
    ? parsed
    : {
        action: "unknown",
        clarification:
          "I couldn't parse that into an action. Try rephrasing — e.g., \"What's my balance?\" or \"Send 0.1 SOL to alice.sol\".",
      };

  return NextResponse.json({ success: true, data: intent });
}
