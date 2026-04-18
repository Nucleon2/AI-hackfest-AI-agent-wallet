# CLAUDE.md — AI Agent Wallet (Solana Hackathon)

## Project Overview

**Name:** AI Agent Wallet (working title — rename as desired)
**Type:** Hackathon project — MLH AI Hackfest, Solana track
**Goal:** A natural language-powered Solana wallet. Users type plain English commands ("Send 2 SOL to Ahmad.sol", "Swap 50 USDC for SOL", "Keep my portfolio 60% SOL 40% USDC") and the AI parses intent, builds the transaction, previews it, and executes on confirmation. Includes an autonomous portfolio manager that monitors drift and rebalances via Jupiter swaps without user intervention.
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
│       ├── swap-quote/
│       │   └── route.ts         # Jupiter API — fetch swap quote for preview
│       ├── swap-build/
│       │   └── route.ts         # Jupiter API — build swap transaction
│       ├── schedules/           # Scheduled payments CRUD + due/execute
│       ├── contacts/            # Contact address book CRUD + resolve
│       ├── chat-sessions/       # Chat session + message persistence
│       └── portfolio/
│           ├── config/
│           │   └── route.ts     # GET/POST/PATCH/DELETE portfolio target allocation
│           ├── status/
│           │   └── route.ts     # Fetch live prices + balances + drift analysis
│           └── rebalance/
│               └── route.ts     # POST: Claude decides swap instructions
├── components/
│   ├── ChatInterface.tsx         # Main chat window — messages, input bar, all intent handlers
│   ├── TransactionPreview.tsx    # Confirmation modal before signing
│   ├── PortfolioCard.tsx         # SOL balance summary card
│   ├── PortfolioManagerCard.tsx  # AI portfolio manager — allocation bars, rebalance UI
│   ├── ReceiptCard.tsx           # Post-transaction receipt with Solscan link
│   ├── TransactionHistoryCard.tsx# Recent transactions from RPC
│   ├── ScheduledPaymentsCard.tsx # Scheduled/recurring payments list
│   ├── ContactsCard.tsx          # Address book contacts list
│   ├── MultiStepPreview.tsx      # Multi-step transaction progress UI
│   ├── Sidebar.tsx               # Balance panel, quick actions, chat sessions, portfolio status
│   └── three/
│       └── WalletOrb.tsx         # React Three Fiber 3D centerpiece orb
├── hooks/
│   ├── useWalletBalance.ts       # Fetches SOL balance, subscribes to account changes
│   ├── useTransactionHistory.ts  # Fetches recent txs from Solana RPC
│   ├── useScheduledPayments.ts   # Polls for due scheduled payments every 30s
│   ├── useAutoApprove.ts         # Auto-approve toggle (localStorage)
│   ├── useChatSessions.ts        # Chat session CRUD + Zustand integration
│   └── usePortfolioManager.ts    # 30s polling loop, drift detection, auto-rebalance execution
├── lib/
│   ├── transactionBuilder.ts     # Builds Solana versioned transactions
│   ├── jupiterClient.ts          # Jupiter lite API wrapper (quote + swap)
│   ├── solanaClient.ts           # RPC connection setup, helpers
│   ├── tokenRegistry.ts          # Supported tokens: SOL, USDC, USDT, BONK, JUP
│   ├── portfolioManager.ts       # Price fetching, allocation math, Claude rebalance call
│   ├── scheduleUtils.ts          # Compute first/next execution times
│   ├── db.ts                     # SQLite schema (better-sqlite3, WAL mode)
│   └── stores/
│       └── chatSessionStore.ts   # Zustand store for active chat session
├── types/
│   ├── intent.ts                 # All intent types + portfolio types (PortfolioConfig, etc.)
│   ├── schedule.ts               # ScheduledPayment interface
│   └── contact.ts                # Contact interface
├── db/
│   └── schedules.db              # SQLite database (auto-created, gitignored)
├── tests/
│   └── portfolio-manager.spec.ts # Playwright end-to-end tests
├── playwright.config.ts
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
  | SendIntent          // "send 0.5 SOL to Alice"
  | SwapIntent          // "swap 10 USDC for SOL"
  | BalanceIntent       // "what's my balance?"
  | HistoryIntent       // "show my last 5 transactions"
  | UnknownIntent       // clarification request
  | ScheduleIntent      // "send 10 USDC to Bob every Friday"
  | ViewSchedulesIntent // "show my scheduled payments"
  | CancelScheduleIntent
  | SaveContactIntent   // "save ABC123 as Alice"
  | ListContactsIntent  // "show my contacts"
  | DeleteContactIntent
  | MultiStepIntent     // "swap 50 USDC to SOL then send it to Alice"
  | SetPortfolioIntent  // "keep my portfolio 60% SOL 30% USDC 10% BONK"
  | ViewPortfolioIntent // "show my portfolio"
  | PausePortfolioIntent
  | ResumePortfolioIntent
  | SetDriftThresholdIntent; // "set drift threshold to 3%"
```

### Claude System Prompt (for `/api/parse-intent`)

The system prompt in `app/api/parse-intent/route.ts` handles all intent types. Key rules:
- Always respond with valid JSON only — no markdown, no preamble
- Supported actions: `send`, `swap`, `balance`, `history`, `unknown`, `schedule`, `view_schedules`, `cancel_schedule`, `save_contact`, `list_contacts`, `delete_contact`, `multi_step`, `set_portfolio`, `view_portfolio`, `pause_portfolio`, `resume_portfolio`, `set_drift_threshold`
- Token names always uppercase; amounts always numbers
- `set_portfolio` — percentages MUST sum to 100, else return `unknown` with clarification
- `multi_step` — chains up to 4 sequential actions; `send.amount = null` means use previous swap output

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

Base URL: `https://lite-api.jup.ag/swap/v1`

1. Call `/quote` with inputMint, outputMint, amount in base units, slippageBps
2. Display the quote in the TransactionPreview modal (rate, price impact, fees)
3. On confirmation, call `/swap` with the quote response + user public key
4. Get back a `swapTransaction` (base64 encoded), deserialize, sign with wallet adapter, broadcast

**Note:** The Jupiter Price API (`/price/v2`) is not available on the lite API. Token prices are derived by requesting a 1-unit swap quote to USDC instead (see `lib/portfolioManager.ts → fetchTokenPrices`).

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
- [x] Balance fetch and display in chat
- [x] Natural language SOL send (parse → preview → sign → broadcast → receipt)
- [ ] Natural language USDC send (SPL token transfer)
- [x] Natural language swap via Jupiter (quote → preview → execute)
- [x] AI-generated receipt after every transaction (links to Solscan)
- [x] Unknown intent handling (Claude asks for clarification)
- [ ] 3D orb reacts to transaction states
- [ ] Devnet working end-to-end with real transactions

---

## Implemented Features

1. **Contacts** — save wallet addresses under names, persisted in SQLite
2. **Transaction history** — "Show my last 5 txs" fetches from RPC
3. **Scheduled sends** — "Send 10 USDC every Friday" — stored in SQLite, polled every 30s
4. **Multi-step commands** — "Swap 50 USDC to SOL then send it to XYZ" — sequential execution with output chaining
5. **Chat session persistence** — conversations saved per wallet in SQLite, visible in sidebar
6. **Auto-approve mode** — toggle to execute transactions without manual confirmation
7. **AI Portfolio Manager** — autonomous rebalancing (see below)

---

## AI Portfolio Manager

### How It Works

```
User: "keep my portfolio 60% SOL, 30% USDC, 10% BONK"
  → SetPortfolioIntent parsed by Claude
  → Config saved to portfolio_configs table in SQLite
  → usePortfolioManager hook polls /api/portfolio/status every 30 seconds
  → Status route fetches token prices (via Jupiter swap quotes) + balances from RPC
  → Calculates current allocation % and drift from targets
  → If maxDrift ≥ driftThreshold: POST /api/portfolio/rebalance
  → Rebalance route calls Claude (haiku) with current vs target allocations
  → Claude returns list of swap instructions (sell overweight → buy underweight)
  → If auto_execute=true: swaps execute silently via Jupiter, receipts appear in chat
  → If auto_execute=false: rebalance preview shown in chat for user confirmation
```

### Natural Language Commands

| Command | Intent |
|---|---|
| `"keep my portfolio 60% SOL 40% USDC"` | `set_portfolio` |
| `"show my portfolio"` | `view_portfolio` |
| `"pause rebalancing"` | `pause_portfolio` |
| `"resume rebalancing"` | `resume_portfolio` |
| `"set drift threshold to 3%"` | `set_drift_threshold` |

### Key Files

| File | Purpose |
|---|---|
| `lib/portfolioManager.ts` | Price fetching, allocation math, rebalance swap generation, Claude call |
| `app/api/portfolio/config/route.ts` | GET/POST/PATCH/DELETE portfolio config |
| `app/api/portfolio/status/route.ts` | Live prices + drift analysis |
| `app/api/portfolio/rebalance/route.ts` | Claude generates swap instructions |
| `hooks/usePortfolioManager.ts` | 30s polling loop, auto-execute orchestration |
| `components/PortfolioManagerCard.tsx` | Animated allocation bars, rebalance preview |

### Database Schema (portfolio_configs table)

```sql
CREATE TABLE portfolio_configs (
  id                 TEXT PRIMARY KEY,
  wallet_pubkey      TEXT NOT NULL UNIQUE,
  targets            TEXT NOT NULL,       -- JSON: [{token, percentage}]
  drift_threshold    REAL NOT NULL DEFAULT 5.0,
  is_active          INTEGER NOT NULL DEFAULT 1,
  auto_execute       INTEGER NOT NULL DEFAULT 0,
  last_rebalanced_at INTEGER,
  created_at         INTEGER NOT NULL
);
```

### Constraints

- Autonomous execution requires the app tab to be open (browser-based polling, same as scheduled payments)
- Minimum swap size: $1.00 USD (prevents micro-rebalances that cost more in fees than they save)
- Swaps execute sequentially, not in parallel (each swap changes portfolio state)
- Target percentages must sum to 100 (±1.5% tolerance for floating-point)

---

## Post-MVP Features (remaining)

1. **Voice input** — Web Speech API, transcribes into chat input
2. **True background rebalancing** — server-side cron with pre-signed transactions (requires custodial key)

---

## Demo Script (for judges)

1. Open the app, connect Phantom wallet (devnet)
2. Type: `"What's in my wallet?"` — shows balance card
3. Type: `"Swap 10 USDC for SOL"` — shows swap quote preview, confirm, show receipt
4. Type: `"Send 0.1 SOL to <address>"` — preview, confirm, receipt with Solscan link
5. Type: `"keep my portfolio 60% SOL, 30% USDC, 10% BONK"` — shows portfolio manager card with allocation bars
6. Type: `"show my portfolio"` — shows live prices, current vs target drift indicators
7. Click "Rebalance Now" — Claude analyzes drift and recommends exact swap amounts
8. Show the orb reacting during the transaction processing state
9. One-liner pitch: "Most wallets make you learn crypto. This one already speaks human — and manages itself."

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