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

**[Demo](#-see-it-in-60-seconds)** · **[Features](#-features)** · **[Architecture](#-architecture)** · **[Getting Started](#-getting-started)** · **[Why Solana](#-why-this-only-works-on-solana)** · **[For the Judges](#-for-the-judges)**

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
| 🎙️ **Voice Input** — press the mic, speak the command, the transcript runs through the same intent pipeline. | 💬 **Chat Session Persistence** — conversations saved per wallet; switch sessions from the sidebar. |
| ⚙️ **Auto-Approve Mode** — opt in to skip the confirmation modal after the AI guard has cleared the transaction. | 🔮 **3D Wallet Orb** — React Three Fiber orb with idle / processing / confirmed / error / scanning states for immediate visual feedback. |

---

## 🎬 See it in 60 seconds

A walkthrough of the demo we'll run for the judges:

1. **Connect** Phantom (devnet) — the orb glows idle.
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
| 3D / WebGL | [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + [Drei](https://github.com/pmndrs/drei) |
| Wallet adapter | [`@solana/wallet-adapter-react`](https://github.com/anza-xyz/wallet-adapter) (Phantom, Backpack) |
| Solana SDK | [`@solana/web3.js`](https://solana-labs.github.io/solana-web3.js/) + [`@solana/spl-token`](https://github.com/solana-labs/solana-program-library) |
| SOL domains | [`@bonfida/spl-name-service`](https://github.com/Bonfida/bonfida-utils) |
| Token swaps | [Jupiter Aggregator API v6](https://station.jup.ag/docs/apis/swap-api) |
| AI layer | [Anthropic Claude](https://www.anthropic.com) — `claude-haiku-4-5-20251001` |
| Persistence | [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) (WAL mode) |
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

> **Devnet vs mainnet.** SOL transfers, contacts, scheduling, and the AI Wallet Guard all work on **devnet**. Jupiter swaps only execute on **mainnet-beta** — on devnet the preview modal shows an inline notice instead of calling the aggregator.

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
│   ├── Sidebar.tsx                # Balance, quick actions, sessions
│   └── three/                     # WalletOrb (R3F) + Scene
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
│   ├── db.ts                      # SQLite schema
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

---

## 🏆 For the judges

Mapped against the MLH AI Hackfest Solana-track judging criteria:

### ✅ Completion
Every MVP feature ships, plus eight bonus features (autonomous portfolio manager, AI Wallet Guard, multi-step chaining, scheduled payments, address book with `.sol` resolution, voice input, chat session persistence, auto-approve mode). The full chat → parse → build → scan → preview → sign → broadcast → receipt loop runs end-to-end on devnet today, and the Jupiter swap path runs end-to-end on mainnet-beta.

### 💡 Originality
We haven't seen a hackathon wallet that combines all three of: (1) natural-language intent parsing across 15+ action types, (2) an *autonomous* portfolio rebalancer that takes action without user prompting, and (3) a Claude-powered security analysis layer that inspects every transaction *before* signing. Most NL-wallet projects stop at "parse a send command." Solace closes the loop on both ends — autonomy on one side, safety on the other.

### 🎯 Adherence to Theme — Solana
Solace is a love letter to what Solana does well. Sub-cent fees turn AI-driven rebalancing from a thought experiment into a product. Sub-second finality turns chat and voice into first-class transaction surfaces. Jupiter v6 gives us best-execution swaps without a custom router. SPL tokens, `.sol` domains via Bonfida, VersionedTransactions, priority-fee compute budgets — every Solana primitive that mattered for the experience is wired in.

### 📚 Learning
Genuine new ground for the team: VersionedTransactions and address-lookup tables, SPL `createTransferCheckedInstruction`, the Jupiter price-API workaround (1-unit quotes against USDC since the lite API has no `/price/v2`), Bonfida name-service resolution, Claude tool-use prompting at the JSON-schema level, React Three Fiber for the wallet orb, and `better-sqlite3` in WAL mode running inside Next.js API routes.

### 🎨 Design
A chat-first interface that hides the complexity instead of celebrating it. State-driven 3D orb (idle / processing / confirmed / error / scanning). The cyan AI Wallet Guard scan overlay turns a security check into a moment of theatre rather than a friction point. Animated drift bars in the portfolio card. A calm dark palette and motion language built with `motion/react` — no dashboards, no candle charts, no "DeFi-bro" energy.

### 🔬 Technology
15+ Claude-driven intent types with strict JSON contracts and discriminated unions. A live Jupiter v6 integration with quote previews, slippage controls, and base64 deserialisation. A 30-second autonomous polling loop that fetches prices, computes drift, calls Claude for swap instructions, and executes sequentially. An AI security layer that consumes the decoded transaction context, returns a risk score with warnings, and persists threats to SQLite. SOL transfers, SPL transfers, `.sol` domain resolution, and Jupiter swaps all backed by a single transaction builder. Compute-budget priority fees on mainnet. Stale-scan abort handling via `AbortController`. It is, frankly, a lot to fit in a hackathon.

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
