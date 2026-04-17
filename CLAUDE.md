# CLAUDE.md — AI Agent Wallet (Solana Hackathon)

## Project Overview

**Name:** AI Agent Wallet (working title — rename as desired)
**Type:** Hackathon project — MLH AI Hackfest, Solana track
**Goal:** A natural language-powered Solana wallet. Users type plain English commands ("Send 2 SOL to Ahmad.sol", "Swap 50 USDC for SOL") and the AI parses intent, builds the transaction, previews it, and executes on confirmation.
**Target:** Win the Solana track by combining AI decision-making with Solana's speed and near-zero fees.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS |
| Animations (UI) | GSAP + Framer Motion |
| 3D / WebGL | React Three Fiber + Drei |
| Wallet adapter | `@solana/wallet-adapter-react` |
| Solana SDK | `@solana/web3.js` |
| Token swaps | Jupiter Aggregator API v6 |
| AI layer | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Deployment | Vercel |
| Network (dev) | Solana devnet |
| Network (prod) | Solana mainnet-beta |
| components | shadcn and magic ui |

---

## Project Structure

```
/
├── app/
│   ├── layout.tsx               # Root layout, wallet provider wrapping
│   ├── page.tsx                 # Main wallet chat UI
│   └── api/
│       ├── parse-intent/
│       │   └── route.ts         # Claude API call — parses user message into structured intent
│       └── swap-quote/
│           └── route.ts         # Jupiter API — fetch swap quote for preview
├── components/
│   ├── ChatInterface.tsx         # Main chat window — messages, input bar
│   ├── MessageBubble.tsx         # Individual message renderer (user vs AI)
│   ├── TransactionPreview.tsx    # Confirmation modal before signing
│   ├── PortfolioCard.tsx         # Token balance summary card
│   ├── ReceiptCard.tsx           # Post-transaction AI-generated receipt
│   ├── WalletConnectButton.tsx   # Phantom/Backpack connect button
│   └── three/
│       └── WalletOrb.tsx         # React Three Fiber 3D centerpiece orb
├── hooks/
│   ├── useWalletBalance.ts       # Fetches SOL + token balances from RPC
│   └── useTransactionHistory.ts  # Fetches recent txs from Solana RPC
├── lib/
│   ├── intentParser.ts           # Types for parsed intents (SendIntent, SwapIntent, etc.)
│   ├── transactionBuilder.ts     # Builds Solana transactions from structured intent
│   ├── jupiterClient.ts          # Jupiter API wrapper (quote + swap)
│   └── solanaClient.ts           # RPC connection setup, helpers
├── types/
│   └── intent.ts                 # TypeScript types for all intent shapes
├── public/
└── CLAUDE.md
```

---

## Core Concepts

### Intent Parsing Flow

Every user message goes through this pipeline:

```
User types message
  → POST /api/parse-intent (sends message + wallet context to Claude)
  → Claude returns structured JSON intent
  → Frontend validates intent type
  → transactionBuilder.ts builds the raw Solana transaction
  → TransactionPreview modal shown to user
  → User confirms → wallet signs → broadcast to Solana
  → AI generates receipt message
```

### Intent Types

All intents are typed in `types/intent.ts`. Every intent has an `action` field as the discriminator.

```typescript
type Intent =
  | SendIntent
  | SwapIntent
  | BalanceIntent
  | HistoryIntent
  | UnknownIntent;

interface SendIntent {
  action: "send";
  amount: number;
  token: string;        // "SOL", "USDC", etc.
  recipient: string;    // wallet address or .sol domain
  memo?: string;
}

interface SwapIntent {
  action: "swap";
  fromToken: string;
  toToken: string;
  amount: number;
  slippageBps?: number; // default 50 (0.5%)
}

interface BalanceIntent {
  action: "balance";
  token?: string;       // if null, return all balances
}

interface HistoryIntent {
  action: "history";
  limit?: number;       // default 5
}

interface UnknownIntent {
  action: "unknown";
  clarification: string; // Claude's message asking for clarification
}
```

### Claude System Prompt (for `/api/parse-intent`)

Use this exact system prompt when calling the Anthropic API:

```
You are an intent parser for a Solana crypto wallet. 
Your ONLY job is to convert the user's natural language message into a structured JSON intent object.

Rules:
- Always respond with valid JSON only. No markdown, no explanation, no preamble.
- Supported actions: "send", "swap", "balance", "history", "unknown"
- For "send": extract amount (number), token (string, uppercase), recipient (string). If recipient looks like a name not an address, still include it as-is — the frontend will resolve it.
- For "swap": extract fromToken, toToken, amount. Default slippageBps to 50 if not specified.
- For "balance": if the user asks about a specific token, include it. Otherwise omit token field.
- For "history": extract limit if mentioned, default to 5.
- If the intent is unclear or unsupported, return action "unknown" with a clarification message.
- Token amounts: always return as a number. "five" = 5, "half a SOL" = 0.5.
- Token names: always uppercase. "sol" = "SOL", "usdc" = "USDC".

Wallet context will be provided in the user message. Use it to resolve relative amounts like "half my SOL".
```

---

## Key Implementation Details

### Solana RPC Connection

```typescript
// lib/solanaClient.ts
import { Connection, clusterApiUrl } from "@solana/web3.js";

export const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl("devnet"),
  "confirmed"
);
```

Use devnet during development. Switch `NEXT_PUBLIC_SOLANA_RPC_URL` to a mainnet RPC (Helius or QuickNode) for the live demo.

### Jupiter Swap Flow

1. Call `https://quote-api.jup.ag/v6/quote` with inputMint, outputMint, amount in lamports
2. Display the quote in the TransactionPreview modal (rate, price impact, fees)
3. On confirmation, call `https://quote-api.jup.ag/v6/swap` with the quote response + user public key
4. Get back a `swapTransaction` (base64 encoded), deserialize, sign with wallet adapter, broadcast

### SOL Domains (.sol)

Resolve `.sol` names using the `@bonfida/spl-name-service` package before building any send transaction. Always resolve to a public key before passing to `transactionBuilder.ts`.

### Transaction Builder Rules

- Always fetch a fresh blockhash immediately before building the transaction (`connection.getLatestBlockhash()`)
- Use `VersionedTransaction` not legacy `Transaction` for all new transactions
- For SOL sends: use `SystemProgram.transfer`
- For SPL token sends: use `@solana/spl-token` — `createTransferCheckedInstruction`
- Always include a compute budget instruction for priority fees on mainnet

---

## 3D Orb (WalletOrb.tsx)

The centerpiece visual. A floating orb that reacts to wallet state.

**States:**
- `idle` — slow rotation, gentle distortion
- `processing` — faster rotation, particles accelerate, color shifts to amber
- `confirmed` — burst particle explosion outward, then resets to idle
- `error` — red pulse, shakes slightly

**Implementation approach:**
- Use `MeshDistortMaterial` from `@react-three/drei` for the base orb
- Use `Points` with a custom shader for the particle cloud surrounding it
- Animate state transitions with `useSpring` from `@react-spring/three`
- Orb sits in a fixed canvas in the background, chat UI overlays it
- Keep canvas `style={{ position: "fixed", inset: 0, zIndex: 0 }}` — chat is `zIndex: 10`

**Performance:**
- Cap particle count at 2000 for safe mobile performance
- Use `dpr={[1, 1.5]}` on the Canvas component
- Suspend the Canvas with a fallback div so it doesn't block the chat from loading

---

## Environment Variables

```env
# .env.local

ANTHROPIC_API_KEY=your_key_here
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

Never expose `ANTHROPIC_API_KEY` to the client. All Claude calls go through `/api/parse-intent` (server-side route).

---

## MVP Checklist

- [ ] Wallet connect (Phantom + Backpack via wallet adapter)
- [ ] Balance fetch and display in chat
- [ ] Natural language SOL send (parse → preview → sign → broadcast → receipt)
- [ ] Natural language USDC send (SPL token transfer)
- [ ] Natural language swap via Jupiter (quote → preview → execute)
- [ ] AI-generated receipt after every transaction (links to Solscan)
- [ ] Unknown intent handling (Claude asks for clarification)
- [ ] 3D orb reacts to transaction states
- [ ] Devnet working end-to-end with real transactions

---

## Post-MVP Features (priority order)

1. **Contacts** — save wallet addresses under names, stored in localStorage
2. **Voice input** — Web Speech API, transcribes into chat input
3. **Transaction history** — "Show my last 5 txs" fetches from RPC, Claude narrates
4. **Scheduled sends** — "Send 10 USDC every Friday" — stored in a simple backend scheduler
5. **Multi-step commands** — "Swap 50 USDC to SOL then send it to XYZ" — Claude returns an array of intents, executed sequentially

---

## Demo Script (for judges)

1. Open the app, connect Phantom wallet (devnet)
2. Type: `"What's in my wallet?"` — shows balance card
3. Type: `"Swap 10 USDC for SOL"` — shows swap quote preview, confirm, show receipt
4. Type: `"Send 0.1 SOL to <address>"` — preview, confirm, receipt with Solscan link
5. Show the orb reacting during the transaction processing state
6. One-liner pitch: "Most wallets make you learn crypto. This one already speaks human."

---

## Coding Conventions

- All components are functional, no class components
- Co-locate types with the file that owns them unless shared across 3+ files
- API routes return `{ success: true, data: ... }` or `{ success: false, error: string }`
- Never `any` — use `unknown` and narrow properly
- Tailwind only for styling — no inline style objects except for dynamic Three.js canvas props
- GSAP animations go in `useEffect` with proper cleanup (`ctx.revert()`)
- All Solana amounts stored and computed in lamports internally, only converted to SOL/UI units for display

---

## Useful Links

- Solana web3.js docs: https://solana-labs.github.io/solana-web3.js/
- Jupiter API v6: https://station.jup.ag/docs/apis/swap-api
- Wallet adapter: https://github.com/anza-xyz/wallet-adapter
- Solscan (devnet): https://solscan.io/?cluster=devnet
- Anthropic API: https://docs.anthropic.com
- React Three Fiber: https://docs.pmnd.rs/react-three-fiber
- Drei helpers: https://github.com/pmndrs/drei
- Bonfida name service: https://github.com/Bonfida/bonfida-utils