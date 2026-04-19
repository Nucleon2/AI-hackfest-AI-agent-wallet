<div align="center">

# 🌌 Solace

### *The Solana wallet that speaks human.*

Natural-language commands. Autonomous portfolio management. An AI security guard on every transaction.
Built for the **Solana track** of **MLH AI Hackfest**.

<br />

[![Solana](https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com)
[![Next.js 14](https://img.shields.io/badge/Next.js_14-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Anthropic Claude](https://img.shields.io/badge/Claude_Haiku_4.5-D4A27F?style=for-the-badge&logo=anthropic&logoColor=white)](https://www.anthropic.com)
[![Jupiter](https://img.shields.io/badge/Jupiter_v6-FBA43A?style=for-the-badge&logo=jupiter&logoColor=white)](https://station.jup.ag)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](#license)
[![MLH AI Hackfest](https://img.shields.io/badge/MLH-AI%20Hackfest-1f2937?style=for-the-badge&logo=majorleaguehacking&logoColor=white)](https://mlh.io)

<br />

**[Demo](#-see-it-in-60-seconds)** · **[Features](#-features)** · **[Architecture](#-architecture)** · **[Getting Started](#-getting-started)** · **[Why Solana](#-why-this-only-works-on-solana)** · **[Under the Hood](#-under-the-hood)**

<!-- Drop a hero screenshot or GIF at docs/hero.png and uncomment the line below -->
<!-- ![Solace hero](docs/hero.png) -->

</div>

---

## ✨ Why Solace?

> **The problem.** Crypto wallets ask humans to speak machine. Copy-paste a base58 address. Convert to lamports. Pick a slippage in basis points. Sign an opaque hex blob and pray.
>
> **The insight.** Solana is fast and cheap enough that an AI can drive the wallet in real time — every spoken intent becomes a sub-second, sub-cent transaction. That's not true on any other major chain.
>
> **The result.** Type *"keep my portfolio 60% SOL, 40% USDC"* and the wallet rebalances itself, forever. Type *"send 2 SOL to ahmad.sol"* and an AI guard scans the transaction before you sign. The wallet meets you where you are — in plain English.

---

## ⚡ Features

| | |
|---|---|
| 🗣️ **Natural-Language Intent Parsing** — 15+ intent types (send, swap, schedule, contacts, portfolio, multi-step, …) parsed by Claude into structured JSON. | 🛡️ **AI Wallet Guard** — every send/swap/stake is analyzed by Claude before signing. Risk badge (safe / caution / danger) + animated scan overlay. Threats are persisted to SQLite. |
| 🤖 **Autonomous Portfolio Manager** — set `60% SOL / 40% USDC` once; a 30-second polling loop monitors drift and rebalances via Jupiter without you. | 🔗 **Multi-Step Command Chaining** — *"swap 50 USDC for SOL then send it to alice.sol"* runs as one supervised pipeline with output chaining. |
| 📅 **Scheduled & Recurring Payments** — *"send 10 USDC to Bob every Friday"* persisted in SQLite, polled every 30 s. | 📇 **Address Book + `.sol` Domains** — save contacts by name; resolve Bonfida `.sol` names before any transfer. |
| 🎙️ **Voice Input** — press the mic, speak the command, the transcript runs through the same intent pipeline. | ⚙️ **Auto-Approve Mode** — opt in to skip the confirmation modal after the AI guard has cleared the transaction. |
| 💬 **Chat Session Persistence** — conversations saved per wallet; switch sessions from the sidebar. | |

---

## 🎬 See it in 60 seconds

A walkthrough of what Solace actually does end-to-end:

1. **Connect** Phantom (devnet).
2. Type **"What's in my wallet?"** — Solace replies with a live balance card.
3. Type **"Send 0.1 SOL to <address>"** — the cyan AI Wallet Guard scan sweeps the modal, lands on a green ✅ *Safe* badge, you confirm, and a Solscan-linked receipt appears in chat.
4. Type **"Swap 10 USDC for SOL"** — Solace pulls a Jupiter v6 quote, shows rate + price impact + fees, you confirm, swap executes.
5. Type **"Keep my portfolio 60% SOL, 30% USDC, 10% BONK"** — the Portfolio Manager card materialises with animated allocation bars.
6. Type **"Show my portfolio"** — live prices + drift indicators (current vs target).
7. Click **"Rebalance Now"** — Claude reads the drift, recommends exact swap amounts, executes them sequentially through Jupiter.

> *Most wallets make you learn crypto. Solace already speaks human, manages itself, and won't let you sign anything suspicious.*

---

## 🏗️ Architecture

### The intent pipeline (every user message)

```mermaid
flowchart TD
    A[User types or speaks a command] --> B[/api/parse-intent]
    B --> C[Claude Haiku 4.5<br/>structured Intent JSON]
    C --> D[transactionBuilder.ts<br/>VersionedTransaction]
    D --> E[/api/analyze-transaction]
    E --> F[AI Wallet Guard<br/>risk score + warnings]
    F --> G[SecurityScanOverlay<br/>cyan animated sweep]
    G --> H[TransactionPreview modal<br/>with risk badge]
    H --> I{User confirms<br/>or auto-approve}
    I --> J[Wallet adapter signs]
    J --> K[Solana RPC<br/>devnet / mainnet-beta]
    K --> L[ReceiptCard with Solscan link]
```

### The autonomous portfolio loop

```mermaid
flowchart LR
    A[usePortfolioManager hook<br/>polls every 30s] --> B[/api/portfolio/status]
    B --> C[Jupiter quotes for live prices<br/>+ on-chain balances]
    C --> D{maxDrift ≥ threshold?}
    D -->|yes| E[/api/portfolio/rebalance]
    E --> F[Claude decides swap instructions]
    F --> G{auto_execute?}
    G -->|on| H[Sequential Jupiter swaps<br/>receipts post to chat]
    G -->|off| I[Rebalance preview<br/>awaits user confirm]
    D -->|no| A
```

---

## 🧱 Tech stack

| Layer | Tool |
|---|---|
| Framework | [Next.js 14](https://nextjs.org) (App Router) |
| Language | [TypeScript](https://www.typescriptlang.org) (strict mode) |
| Styling | [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) + [Magic UI](https://magicui.design) |
| Animation | [`motion/react`](https://motion.dev) (Framer Motion v12) |
| Wallet adapter | [`@solana/wallet-adapter-react`](https://github.com/anza-xyz/wallet-adapter) (Phantom, Backpack) |
| Solana SDK | [`@solana/web3.js`](https://solana-labs.github.io/solana-web3.js/) + [`@solana/spl-token`](https://github.com/solana-labs/solana-program-library) |
| SOL domains | [`@bonfida/spl-name-service`](https://github.com/Bonfida/bonfida-utils) |
| Token swaps | [Jupiter Aggregator API v6](https://station.jup.ag/docs/apis/swap-api) |
| AI layer | [Anthropic Claude](https://www.anthropic.com) — `claude-haiku-4-5-20251001` |
| Persistence | [Turso](https://turso.tech) / libSQL via [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts) (local file in dev, serverless HTTP in production) |
| State | [Zustand](https://github.com/pmndrs/zustand) |
| Testing | [Playwright](https://playwright.dev) |
| Deployment | [Vercel](https://vercel.com) |

---

## 🚀 Getting started

### Prerequisites

- **Node.js 18+** and npm
- A **Solana wallet** — [Phantom](https://phantom.app) or [Backpack](https://backpack.app)
- An **[Anthropic API key](https://console.anthropic.com)** (free tier is enough for the demo)
- *Optional:* a mainnet RPC URL ([Helius](https://helius.dev) / [QuickNode](https://quicknode.com)) — only required if you want to execute live Jupiter swaps

### Setup

```bash
# 1. Clone
git clone https://github.com/Nucleon2/AI-hackfest-AI-agent-wallet.git
cd AI-hackfest-AI-agent-wallet

# 2. Install
npm install

# 3. Configure
cp .env.example .env.local
# then open .env.local and fill in ANTHROPIC_API_KEY

# 4. Run
npm run dev
```

Open <http://localhost:3000>, connect your wallet, and start typing.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Server-only Claude key. Powers intent parsing, the Wallet Guard, and the portfolio rebalancer. |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | ✅ | Defaults to `https://api.devnet.solana.com`. Swap for a Helius/QuickNode mainnet URL to run live swaps. |
| `NEXT_PUBLIC_SOLANA_NETWORK` | ✅ | `devnet` or `mainnet-beta`. Controls the network label shown in the UI. |
| `TURSO_DATABASE_URL` | Prod only | Turso libSQL connection URL. Leave blank in dev — the app writes to `./db/schedules.db`. |
| `TURSO_AUTH_TOKEN` | Prod only | Turso auth token paired with the URL above. |

> **Devnet vs mainnet.** SOL transfers, contacts, scheduling, and the AI Wallet Guard all work on **devnet**. Jupiter swaps only execute on **mainnet-beta** — on devnet the preview modal shows an inline notice instead of calling the aggregator.

---

## ☁️ Deploying to Vercel

The app is designed for a zero-friction Vercel deploy. The only architectural wrinkle Vercel introduces is that its serverless filesystem is ephemeral, so persistence runs against a **hosted libSQL database (Turso)** in production and a local file in development — the same `@libsql/client` driver speaks both.

### 1. Provision a Turso database

```bash
# Install the Turso CLI (https://docs.turso.tech/cli/installation)
turso auth signup            # or: turso auth login
turso db create solace       # creates the database
turso db show solace --url   # copy this → TURSO_DATABASE_URL
turso db tokens create solace # copy this → TURSO_AUTH_TOKEN
```

No schema migration step is required — `lib/db.ts` runs `CREATE TABLE IF NOT EXISTS` on first request.

### 2. Set Vercel environment variables

In **Project Settings → Environment Variables** (Production + Preview), add:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Claude key from [console.anthropic.com](https://console.anthropic.com) |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | A **private mainnet** RPC URL (Helius / QuickNode). The public `api.mainnet-beta.solana.com` URL will rate-limit during the demo. |
| `NEXT_PUBLIC_SOLANA_NETWORK` | `mainnet-beta` |
| `TURSO_DATABASE_URL` | From step 1 |
| `TURSO_AUTH_TOKEN` | From step 1 |

### 3. Deploy

Push to GitHub, import the repo in the Vercel dashboard, and click **Deploy**. No custom build or install command is needed — Vercel detects Next.js 14 automatically. Node 20+ is enforced via `package.json#engines`.

### Verifying persistence survives redeploys

Connect a wallet, save a contact (e.g. `"save <address> as test"`), trigger another deploy from the Vercel dashboard, and confirm the contact is still there. This is the canary: if it persists, every other table (schedules, portfolio configs, DCA orders, price alerts, threat log, chat sessions + messages) does too.

### Tests

```bash
npx playwright test
```

End-to-end tests live in `tests/` (`portfolio-manager.spec.ts`, `staking.spec.ts`).

---

## 📁 Project structure

<details>
<summary>Click to expand the directory tree</summary>

```
/
├── app/
│   ├── layout.tsx                 # Root layout, wallet provider wrapping
│   ├── page.tsx                   # Main wallet chat UI
│   └── api/
│       ├── parse-intent/          # Claude → structured Intent JSON
│       ├── analyze-transaction/   # AI Wallet Guard security scan
│       ├── swap-quote/            # Jupiter v6 — quote
│       ├── swap-build/            # Jupiter v6 — build transaction
│       ├── schedules/             # Scheduled payments CRUD + execute
│       ├── contacts/              # Address book CRUD + resolve
│       ├── chat-sessions/         # Chat persistence
│       └── portfolio/
│           ├── config/            # GET/POST/PATCH/DELETE target allocation
│           ├── status/            # Live prices + drift analysis
│           └── rebalance/         # Claude-decided swap instructions
├── components/
│   ├── ChatInterface.tsx          # Main chat surface, intent dispatcher
│   ├── TransactionPreview.tsx     # Confirmation modal with risk analysis
│   ├── SecurityScanOverlay.tsx    # Cyan AI Wallet Guard sweep animation
│   ├── PortfolioManagerCard.tsx   # Allocation bars, rebalance UI
│   ├── ReceiptCard.tsx            # Post-tx receipt with Solscan link
│   ├── MultiStepPreview.tsx       # Multi-step transaction progress
│   └── Sidebar.tsx                # Balance, quick actions, sessions
├── hooks/
│   ├── useWalletBalance.ts
│   ├── useTransactionHistory.ts
│   ├── useScheduledPayments.ts
│   ├── useChatSessions.ts
│   └── usePortfolioManager.ts     # 30s drift loop + auto-execute
├── lib/
│   ├── transactionBuilder.ts      # VersionedTransaction builder
│   ├── jupiterClient.ts           # Jupiter lite API wrapper
│   ├── solanaClient.ts            # RPC connection
│   ├── tokenRegistry.ts           # SOL, USDC, USDT, BONK, JUP
│   ├── portfolioManager.ts        # Pricing, allocation math, Claude call
│   ├── db.ts                      # libSQL client + schema
│   └── stores/chatSessionStore.ts # Zustand
├── types/                         # Intent / Schedule / Contact types
├── tests/                         # Playwright e2e
└── CLAUDE.md                      # Internal architecture doc
```

</details>

---

## 🌐 Why this only works on Solana

Solace is a deliberate showcase of what Solana enables that other chains don't:

- **Sub-cent fees** make autonomous rebalancing economically viable. A monthly drift correction on Ethereum L1 would cost more than it saves; on Solana it's noise.
- **Sub-second finality** is what makes a chat or voice command *feel* like a wallet command instead of a delayed write to a queue. The AI Wallet Guard scan is over before the user has lifted their finger.
- **Jupiter** turns "best-execution swap routing" into a single REST call — no manual liquidity-pool selection, no MEV anxiety.
- **Versioned Transactions + address-lookup tables** keep complex multi-step intents inside a single signed payload.
- **SPL tokens, Bonfida `.sol` domains, and compute-budget priority fees on mainnet** are all wired in — every Solana primitive that mattered for the experience is there, not stubbed.

---

## 🛠️ What's in the box

Solace ships the full loop end-to-end. On devnet, chat → parse → build → scan → preview → sign → broadcast → receipt works today for SOL and SPL transfers. On mainnet-beta, the Jupiter v6 swap path runs the same round trip — quote, preview, execute, receipt. Alongside the MVP set, there are eight larger features already landed: the autonomous portfolio manager, the AI Wallet Guard, multi-step command chaining, scheduled and recurring payments, an address book with `.sol` resolution, voice input, per-wallet chat session persistence, and an opt-in auto-approve mode.

The combination is what makes Solace unusual. Most natural-language wallet projects stop at "parse a send command." Solace pairs intent parsing across 15+ action types with an *autonomous* portfolio rebalancer that takes action without prompting, and a Claude-powered security layer that inspects every transaction *before* signing. Autonomy on one side, safety on the other, with plain-English commands as the connective tissue.

---

## 🔧 Under the hood

A few engineering notes on how Solace is put together:

- **15+ intent types** with strict JSON contracts and discriminated unions — `send`, `swap`, `multi_step`, `set_portfolio`, `schedule`, and friends all route through a single parser and a single transaction builder.
- **VersionedTransactions + address-lookup tables** for every outbound transaction, so complex multi-step intents stay inside a single signed payload.
- **SPL transfers via `createTransferCheckedInstruction`**, with SOL, USDC, USDT, BONK, and JUP in the token registry.
- **Jupiter v6 integration** with quote previews, slippage controls, and base64 `VersionedTransaction` deserialisation.
- **Jupiter price-API workaround** — the lite API has no `/price/v2`, so `lib/portfolioManager.ts` derives token prices by requesting 1-unit quotes against USDC.
- **Bonfida name-service resolution** so `.sol` names become public keys before a transfer is ever built.
- **Claude tool-use at the JSON-schema level**, with a single system prompt driving every intent type and a separate prompt driving the rebalancer.
- **30-second autonomous polling loop** that fetches prices, computes drift, calls Claude for swap instructions, and executes sequentially.
- **AI Wallet Guard** — consumes the decoded transaction context, returns a risk score with warnings, persists caution/danger results to libSQL. Stale scan responses are cancelled via `AbortController` when the preview changes.
- **Turso / libSQL inside Next.js App Router API routes**, with a local-file fallback for dev (same `@libsql/client` driver for both).
- **Compute-budget priority fees** on mainnet.

---

## 🎨 Design notes

Chat-first UI that hides the complexity instead of celebrating it. The cyan AI Wallet Guard scan overlay turns a security check into a moment of theatre rather than a friction point. Animated drift bars in the portfolio card. A calm dark palette and motion language built with `motion/react` — no dashboards, no candle charts, no "DeFi-bro" energy.

---

## 🙌 Built at MLH AI Hackfest — Solana Track

Built for the **[Solana track](https://mlh.io)** of MLH AI Hackfest. Powered by [Solana](https://solana.com), [Anthropic Claude](https://www.anthropic.com), and [Jupiter](https://jup.ag).

Special thanks to the Solana, Jupiter, and Bonfida documentation teams — your docs are the reason this fits in a weekend.

---

## License

[MIT](LICENSE) — do anything you want, just keep the copyright.

---

<div align="center">

**Most wallets make you learn crypto. Solace speaks human — and won't let you sign anything suspicious.**

<sub>[⬆ back to top](#-solace)</sub>

</div>
