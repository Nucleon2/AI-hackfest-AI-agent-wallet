"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";
import { PortfolioCard } from "@/components/PortfolioCard";
import { ReceiptCard } from "@/components/ReceiptCard";
import { TransactionHistoryCard } from "@/components/TransactionHistoryCard";
import { ScheduledPaymentsCard } from "@/components/ScheduledPaymentsCard";
import { ContactsCard } from "@/components/ContactsCard";
import { DCACard } from "@/components/DCACard";
import { AutoApproveToggle } from "@/components/AutoApproveToggle";
import { useAutoApprove } from "@/hooks/useAutoApprove";
import { useChatSessions } from "@/hooks/useChatSessions";
import {
  TransactionPreview,
  type PreviewStatus,
  type StakeQuoteDisplay,
  type SwapQuoteDisplay,
} from "@/components/TransactionPreview";
import { StakingCard } from "@/components/StakingCard";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { useScheduledPayments } from "@/hooks/useScheduledPayments";
import { useDCAManager } from "@/hooks/useDCAManager";
import { useChatSessionStore } from "@/lib/stores/chatSessionStore";
import type { ChatMessageRow } from "@/lib/db";
import {
  buildSolTransferTx,
  deserializeLegacyTx,
  deserializeSwapTx,
  shortAddress,
  validateRecipient,
} from "@/lib/transactionBuilder";
import { SOLANA_NETWORK, type SolanaNetwork } from "@/lib/solanaClient";
import type { JupiterQuote } from "@/lib/jupiterClient";
import type {
  Intent,
  SendIntent,
  SwapIntent,
  SaveContactIntent,
  ListContactsIntent,
  DeleteContactIntent,
  MultiStepIntent,
  SetPortfolioIntent,
  RebalanceSwap,
  StakeIntent,
  StakingProvider,
  UnstakeIntent,
  ExplainTxIntent,
  DCAIntent,
  CancelDCAIntent,
  PriceAlertIntent,
  DCAOrder,
  PriceAlert,
} from "@/types/intent";
import { PortfolioManagerCard } from "@/components/PortfolioManagerCard";
import { ExplanationCard, type ExplanationCardProps } from "@/components/ExplanationCard";
import { InsightsCard, type InsightsPayload } from "@/components/InsightsCard";
import { usePortfolioManager } from "@/hooks/usePortfolioManager";
import { MultiStepPreview, type StepRunStatus } from "@/components/MultiStepPreview";
import type { ScheduledPayment } from "@/types/schedule";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { VoiceWaveform } from "@/components/VoiceWaveform";
import { setOrbState } from "@/lib/stores/orbStore";
import { SecurityScanOverlay } from "@/components/SecurityScanOverlay";
import type { TxAnalysis } from "@/app/api/analyze-transaction/route";

type Role = "user" | "ai";
type MessageComponent =
  | "portfolio"
  | "receipt"
  | "history"
  | "schedules"
  | "contacts"
  | "portfolio_manager"
  | "staking"
  | "explanation"
  | "insights"
  | "dca_manager";

type ReceiptPayload =
  | {
      kind: "send";
      signature: string;
      amount: number;
      token: string;
      recipient: string;
      network: SolanaNetwork;
    }
  | {
      kind: "swap";
      signature: string;
      fromAmount: number;
      fromToken: string;
      toAmount: number;
      toToken: string;
      network: SolanaNetwork;
    }
  | {
      kind: "stake" | "unstake";
      signature: string;
      provider: StakingProvider;
      inputAmount: number;
      outputAmount: number;
      network: SolanaNetwork;
    };

interface Message {
  id: string;
  role: Role;
  text?: string;
  component?: MessageComponent;
  receipt?: ReceiptPayload;
  historyLimit?: number;
  explanation?: ExplanationCardProps;
  insights?: InsightsPayload;
  ts: number;
}

const WELCOME: Message = {
  id: "welcome",
  role: "ai",
  text: "Hey! I'm your AI wallet assistant. Connect a Phantom wallet and try:\n\u2022 \"What's my balance?\"\n\u2022 \"Swap 10 USDC for SOL\"\n\u2022 \"Send 0.1 SOL to Alice\" — save contacts first!\n\u2022 \"Save [address] as Alice\"\n\u2022 \"Swap 5 USDC to SOL then send it to Alice\" — multi-step!",
  ts: Date.now(),
};

const SUGGESTIONS = [
  "What's my balance?",
  "Swap 10 USDC for SOL",
  "Show my contacts",
  "Send 0.1 SOL to alice.sol",
  "Show my last 5 transactions",
  "Swap 5 USDC to SOL then send it to Alice",
];

interface ResolvedStep {
  kind: "swap" | "send" | "display";
  swapIntent?: SwapIntent;
  sendIntent?: SendIntent;
  chainAmount?: boolean;
  displayKind?: "history" | "balance";
  historyLimit?: number;
}

interface PreparedTx {
  transaction: VersionedTransaction;
  blockhashInfo: { blockhash: string; lastValidBlockHeight: number };
}

interface PreparedSwap {
  quote: JupiterQuote;
  fromSymbol: string;
  toSymbol: string;
  inUiAmount: number;
  outUiAmount: number;
}

const HISTORY_WINDOW = 10;

function componentSummary(component: MessageComponent, msg: Message): string {
  switch (component) {
    case "portfolio":
      return "[AI showed wallet balance and portfolio]";
    case "history":
      return `[AI showed last ${msg.historyLimit ?? 5} transactions]`;
    case "receipt":
      if (msg.receipt?.kind === "send")
        return `[Sent ${msg.receipt.amount} ${msg.receipt.token} to ${msg.receipt.recipient}]`;
      if (msg.receipt?.kind === "swap")
        return `[Swapped ${msg.receipt.fromAmount} ${msg.receipt.fromToken} → ${msg.receipt.toAmount} ${msg.receipt.toToken}]`;
      return "[Transaction completed]";
    case "schedules":
      return "[AI showed scheduled payments]";
    case "contacts":
      return "[AI showed address book contacts]";
    case "portfolio_manager":
      return "[AI showed portfolio manager with allocation targets]";
    case "staking":
      return "[AI showed liquid staking positions and APY]";
    case "explanation":
      return msg.explanation
        ? `[AI explained tx: ${msg.explanation.summary}]`
        : "[AI explained a transaction]";
    case "insights":
      return msg.insights
        ? `[AI showed spending insights: ${msg.insights.txCount} txs, ${msg.insights.totalSolOut.toFixed(4)} SOL out]`
        : "[AI showed spending insights]";
    case "dca_manager":
      return "[AI showed DCA orders and price alerts]";
  }
}

function buildConversationHistory(msgs: Message[]): Array<{ role: "user" | "assistant"; content: string }> {
  return msgs
    .filter((m) => m.id !== "welcome")
    .slice(-HISTORY_WINDOW)
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.component ? componentSummary(m.component, m) : (m.text ?? ""),
    }))
    .filter((m) => m.content.trim().length > 0);
}

function rowsToMessages(rows: ChatMessageRow[]): Message[] {
  return rows.map((row) => {
    const msg: Message = {
      id: row.id,
      role: row.role,
      ts: row.ts,
    };
    if (row.text) msg.text = row.text;
    if (row.component) msg.component = row.component as MessageComponent;
    if (row.receipt_json) {
      try {
        const parsed = JSON.parse(row.receipt_json);
        if (row.component === "explanation") {
          msg.explanation = parsed as ExplanationCardProps;
        } else if (row.component === "insights") {
          msg.insights = parsed as InsightsPayload;
        } else {
          msg.receipt = parsed as ReceiptPayload;
        }
      } catch {
        // ignore malformed
      }
    }
    if (row.history_limit !== null) msg.historyLimit = row.history_limit;
    return msg;
  });
}

export function ChatInterface() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { balance } = useWalletBalance();

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const voice = useVoiceInput({
    onTranscript: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setInput(trimmed);
      inputRef.current?.focus();
    },
    onError: (err) => console.warn("[voice]", err),
  });

  const [pendingSend, setPendingSend] = useState<SendIntent | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("building");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFeeLamports, setPreviewFeeLamports] = useState<number | null>(
    null
  );
  const [previewRecipientPubkey, setPreviewRecipientPubkey] = useState<
    string | null
  >(null);
  const preparedTxRef = useRef<PreparedTx | null>(null);

  const [pendingSwap, setPendingSwap] = useState<SwapIntent | null>(null);
  const [swapPreviewStatus, setSwapPreviewStatus] =
    useState<PreviewStatus>("building");
  const [swapPreviewError, setSwapPreviewError] = useState<string | null>(null);
  const [swapQuoteDisplay, setSwapQuoteDisplay] =
    useState<SwapQuoteDisplay | null>(null);
  const preparedSwapRef = useRef<PreparedSwap | null>(null);

  const [pendingStake, setPendingStake] = useState<
    StakeIntent | UnstakeIntent | null
  >(null);
  const [stakePreviewStatus, setStakePreviewStatus] =
    useState<PreviewStatus>("building");
  const [stakePreviewError, setStakePreviewError] = useState<string | null>(null);
  const [stakeQuoteDisplay, setStakeQuoteDisplay] =
    useState<StakeQuoteDisplay | null>(null);

  const [pendingScheduledExec, setPendingScheduledExec] =
    useState<ScheduledPayment | null>(null);
  const [scheduleExecStatus, setScheduleExecStatus] =
    useState<PreviewStatus>("building");
  const [scheduleExecError, setScheduleExecError] = useState<string | null>(
    null
  );
  const [scheduleExecFee, setScheduleExecFee] = useState<number | null>(null);
  const preparedScheduleRef = useRef<PreparedTx | null>(null);

  // --- Multi-step state ---
  const [pendingMultiStep, setPendingMultiStep] = useState<MultiStepIntent | null>(null);
  const [multiStepIndex, setMultiStepIndex] = useState(0);
  const [multiStepStatuses, setMultiStepStatuses] = useState<StepRunStatus[]>([]);
  const [multiStepError, setMultiStepError] = useState<string | null>(null);
  const resolvedStepsRef = useRef<ResolvedStep[]>([]);
  const multiStepAbortRef = useRef(false);
  const capturedSwapOutRef = useRef<{ outUiAmount: number; toToken: string } | null>(null);
  const multiStepLastErrorRef = useRef<string | null>(null);

  const [securityAnalysis, setSecurityAnalysis] = useState<TxAnalysis | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const { schedules, duePayment, loading: schedulesLoading, refresh: refreshSchedules, clearDue } =
    useScheduledPayments(publicKey?.toBase58() ?? null);

  // --- Portfolio manager ---
  const [portfolioMsgIds, setPortfolioMsgIds] = useState<string[]>([]);

  const requestUnstake = useCallback(
    (provider: StakingProvider, amount: number) => {
      setPendingStake({ action: "unstake", amount, provider });
    },
    []
  );

  const runSecurityScan = useCallback(
    async (txContext: Record<string, unknown>) => {
      if (!publicKey) return;
      setIsScanning(true);
      setSecurityAnalysis(null);
      setOrbState("scanning");
      try {
        const res = await fetch("/api/analyze-transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txContext,
            walletPubkey: publicKey.toBase58(),
            solBalance: balance ?? 0,
          }),
        });
        const json = (await res.json()) as { success: boolean; data?: TxAnalysis };
        if (json.success && json.data) setSecurityAnalysis(json.data);
      } catch {
        // Graceful degradation — scan failure never blocks signing
      } finally {
        setIsScanning(false);
        setOrbState("idle");
      }
    },
    [publicKey, balance]
  );

  const executeRebalanceSwap = useCallback(async (swap: RebalanceSwap): Promise<boolean> => {
    if (!publicKey) return false;
    try {
      const quoteRes = await fetch("/api/swap-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromToken: swap.fromToken,
          toToken: swap.toToken,
          amount: swap.fromAmount,
          slippageBps: swap.slippageBps,
        }),
      });
      const quoteJson = (await quoteRes.json()) as
        | { success: true; data: { quote: import("@/lib/jupiterClient").JupiterQuote; display: import("@/components/TransactionPreview").SwapQuoteDisplay } }
        | { success: false; error?: string };
      if (!quoteJson.success) return false;

      const buildRes = await fetch("/api/swap-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: quoteJson.data.quote, userPublicKey: publicKey.toBase58() }),
      });
      const buildJson = (await buildRes.json()) as
        | { success: true; data: { swapTransaction: string; lastValidBlockHeight: number } }
        | { success: false; error?: string };
      if (!buildJson.success) return false;

      const tx = deserializeSwapTx(buildJson.data.swapTransaction);
      const sig = await sendTransaction(tx, connection);
      const blockhash = tx.message.recentBlockhash;
      const result = await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight: buildJson.data.lastValidBlockHeight },
        "confirmed"
      );
      if (result.value.err) return false;

      appendMessage({
        id: crypto.randomUUID(),
        role: "ai",
        component: "receipt",
        receipt: {
          kind: "swap",
          signature: sig,
          fromAmount: swap.fromAmount,
          fromToken: swap.fromToken,
          toAmount: quoteJson.data.display.outUiAmount,
          toToken: swap.toToken,
          network: SOLANA_NETWORK,
        },
        ts: Date.now(),
      });
      return true;
    } catch {
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, sendTransaction, connection]);

  const {
    config: portfolioConfig,
    status: portfolioStatus,
    isRebalancing,
    pendingSwaps: portfolioPendingSwaps,
    rebalanceReasoning,
    error: portfolioError,
    triggerRebalance,
    dismissPendingSwaps,
    updateConfig: updatePortfolioConfig,
  } = usePortfolioManager(publicKey?.toBase58() ?? null, executeRebalanceSwap);

  // --- DCA manager ---
  const handleAlertTriggered = useCallback(
    ({ alert, currentPrice }: { alert: PriceAlert; currentPrice: number }) => {
      appendMessage({
        id: crypto.randomUUID(),
        role: "ai",
        text: `${alert.token} just crossed ${alert.direction} $${alert.target_price} — current price $${currentPrice.toFixed(2)}.`,
        ts: Date.now(),
      });
    },
    // appendMessage is stable — defined below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const {
    orders: dcaOrders,
    alerts: priceAlerts,
    dueOrder: dueDCAOrder,
    loading: dcaLoading,
    refresh: refreshDCA,
    cancelOrder: cancelDCAOrder,
    deleteAlert: deletePriceAlert,
    clearDueOrder: clearDueDCAOrder,
  } = useDCAManager(publicKey?.toBase58() ?? null, handleAlertTriggered);

  const executeDCAOrder = useCallback(
    async (order: DCAOrder): Promise<boolean> => {
      if (!publicKey) return false;
      try {
        const priceRes = await fetch(
          `/api/price?token=${encodeURIComponent(order.input_token)}`
        );
        const priceJson = (await priceRes.json()) as
          | { success: true; data: Record<string, number> }
          | { success: false; error?: string };
        if (!priceJson.success) return false;
        const price = priceJson.data[order.input_token];
        if (!price || price <= 0) return false;
        const inputUiAmount = order.amount_usd / price;

        const quoteRes = await fetch("/api/swap-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromToken: order.input_token,
            toToken: order.output_token,
            amount: inputUiAmount,
            slippageBps: 50,
          }),
        });
        const quoteJson = (await quoteRes.json()) as
          | { success: true; data: { quote: JupiterQuote; display: SwapQuoteDisplay } }
          | { success: false; error?: string };
        if (!quoteJson.success) return false;

        const buildRes = await fetch("/api/swap-build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quote: quoteJson.data.quote,
            userPublicKey: publicKey.toBase58(),
          }),
        });
        const buildJson = (await buildRes.json()) as
          | { success: true; data: { swapTransaction: string; lastValidBlockHeight: number } }
          | { success: false; error?: string };
        if (!buildJson.success) return false;

        const tx = deserializeSwapTx(buildJson.data.swapTransaction);
        const sig = await sendTransaction(tx, connection);
        const blockhash = tx.message.recentBlockhash;
        const result = await connection.confirmTransaction(
          {
            signature: sig,
            blockhash,
            lastValidBlockHeight: buildJson.data.lastValidBlockHeight,
          },
          "confirmed"
        );
        if (result.value.err) return false;

        await fetch(`/api/dca/${order.id}/executed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletPubkey: publicKey.toBase58(),
            signature: sig,
          }),
        });

        appendMessage({
          id: crypto.randomUUID(),
          role: "ai",
          component: "receipt",
          receipt: {
            kind: "swap",
            signature: sig,
            fromAmount: inputUiAmount,
            fromToken: order.input_token,
            toAmount: quoteJson.data.display.outUiAmount,
            toToken: order.output_token,
            network: SOLANA_NETWORK,
          },
          ts: Date.now(),
        });
        return true;
      } catch {
        return false;
      }
    // appendMessage is defined below — its identity does not change meaningfully per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [publicKey, sendTransaction, connection]
  );

  // Auto-execute the due DCA order. Since the user explicitly opted into
  // recurring buys, we run silently — Phantom will still prompt for signing.
  const dcaExecutingRef = useRef(false);
  useEffect(() => {
    if (!dueDCAOrder || dcaExecutingRef.current) return;
    if (SOLANA_NETWORK !== "mainnet-beta") {
      // Swaps fail on devnet; clear the due marker so we don't spin
      clearDueDCAOrder();
      return;
    }
    dcaExecutingRef.current = true;
    (async () => {
      const order = dueDCAOrder;
      clearDueDCAOrder();
      const ok = await executeDCAOrder(order);
      if (ok) {
        await refreshDCA();
      } else {
        appendMessage({
          id: crypto.randomUUID(),
          role: "ai",
          text: `DCA run failed for ${order.input_token} → ${order.output_token}. I'll retry on the next tick.`,
          ts: Date.now(),
        });
      }
      dcaExecutingRef.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueDCAOrder]);

  // When drift is detected and auto-execute is off, show the portfolio card in chat
  const prevPendingSwapsRef = useRef<RebalanceSwap[] | null>(null);
  useEffect(() => {
    if (portfolioPendingSwaps && portfolioPendingSwaps !== prevPendingSwapsRef.current) {
      prevPendingSwapsRef.current = portfolioPendingSwaps;
      appendMessage({
        id: crypto.randomUUID(),
        role: "ai",
        text: "Portfolio drift detected — Claude recommends rebalancing:",
        ts: Date.now(),
      });
      const cardId = crypto.randomUUID();
      setPortfolioMsgIds((prev) => [...prev, cardId]);
      appendMessage({ id: cardId, role: "ai", component: "portfolio_manager", ts: Date.now() });
    }
    if (!portfolioPendingSwaps) prevPendingSwapsRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioPendingSwaps]);

  const { autoApprove, toggle: toggleAutoApprove } = useAutoApprove();

  // --- Chat session persistence ---
  const { activeSessionId, bumpSession, updateSessionTitle } = useChatSessionStore();
  const { loadSessions, createSession } = useChatSessions(publicKey?.toBase58() ?? null);

  // Load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([WELCOME]);
      return;
    }
    fetch(`/api/chat-sessions/${activeSessionId}/messages`)
      .then((r) => r.json())
      .then((json: { success: boolean; data?: ChatMessageRow[] }) => {
        if (json.success && json.data && json.data.length > 0) {
          setMessages(rowsToMessages(json.data));
        } else {
          setMessages([WELCOME]);
        }
      })
      .catch(() => setMessages([WELCOME]));
  }, [activeSessionId]);

  // Init session on wallet connect
  useEffect(() => {
    if (!publicKey) {
      setMessages([WELCOME]);
      return;
    }
    async function initSession() {
      await loadSessions();
      const { sessions, setActiveSessionId } = useChatSessionStore.getState();
      if (sessions.length > 0) {
        setActiveSessionId(sessions[0].id);
      } else {
        await createSession();
      }
    }
    initSession();
  }, [publicKey?.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!pendingSend) return;
    let cancelled = false;

    async function preflight(intent: SendIntent) {
      setPreviewStatus("building");
      setPreviewError(null);
      setPreviewFeeLamports(null);
      setPreviewRecipientPubkey(null);
      preparedTxRef.current = null;

      if (intent.token.toUpperCase() !== "SOL") {
        if (cancelled) return;
        setPreviewError("Only SOL sends are supported right now.");
        setPreviewStatus("error");
        return;
      }

      const validation = validateRecipient(intent.recipient);
      if (!validation.ok) {
        if (cancelled) return;
        setPreviewError(validation.error);
        setPreviewStatus("error");
        return;
      }

      try {
        const fromPubkey = publicKey;
        if (!fromPubkey) throw new Error("Wallet not connected.");
        const built = await buildSolTransferTx({
          connection,
          from: fromPubkey,
          to: validation.pubkey,
          amountSol: intent.amount,
        });
        if (cancelled) return;
        preparedTxRef.current = {
          transaction: built.transaction,
          blockhashInfo: built.blockhashInfo,
        };
        setPreviewFeeLamports(built.feeLamports);
        setPreviewRecipientPubkey(validation.pubkey.toBase58());
        setPreviewStatus("ready");
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to build transaction.";
        setPreviewError(msg);
        setPreviewStatus("error");
      }
    }

    if (!publicKey) {
      setPreviewError("Connect your wallet to send.");
      setPreviewStatus("error");
      return;
    }
    preflight(pendingSend);

    return () => {
      cancelled = true;
    };
  }, [pendingSend, publicKey, connection]);

  useEffect(() => {
    if (!pendingSwap) return;
    let cancelled = false;

    async function preflightSwap(intent: SwapIntent) {
      setSwapPreviewStatus("building");
      setSwapPreviewError(null);
      setSwapQuoteDisplay(null);
      preparedSwapRef.current = null;

      if (intent.fromToken.toUpperCase() === intent.toToken.toUpperCase()) {
        if (cancelled) return;
        setSwapPreviewError("fromToken and toToken must be different.");
        setSwapPreviewStatus("error");
        return;
      }

      try {
        const res = await fetch("/api/swap-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromToken: intent.fromToken,
            toToken: intent.toToken,
            amount: intent.amount,
            slippageBps: intent.slippageBps ?? 50,
          }),
        });
        const json = (await res.json()) as
          | {
              success: true;
              data: { quote: JupiterQuote; display: SwapQuoteDisplay };
            }
          | { success: false; error?: string };

        if (cancelled) return;
        if (!json.success) {
          setSwapPreviewError(json.error ?? "Failed to fetch swap quote.");
          setSwapPreviewStatus("error");
          return;
        }
        preparedSwapRef.current = {
          quote: json.data.quote,
          fromSymbol: json.data.display.fromSymbol,
          toSymbol: json.data.display.toSymbol,
          inUiAmount: json.data.display.inUiAmount,
          outUiAmount: json.data.display.outUiAmount,
        };
        setSwapQuoteDisplay(json.data.display);
        setSwapPreviewStatus("ready");
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to fetch swap quote.";
        setSwapPreviewError(msg);
        setSwapPreviewStatus("error");
      }
    }

    if (!publicKey) {
      setSwapPreviewError("Connect your wallet to swap.");
      setSwapPreviewStatus("error");
      return;
    }
    preflightSwap(pendingSwap);

    return () => {
      cancelled = true;
    };
  }, [pendingSwap, publicKey]);

  useEffect(() => {
    if (!pendingStake) return;
    let cancelled = false;

    async function preflightStake(intent: StakeIntent | UnstakeIntent) {
      setStakePreviewStatus("building");
      setStakePreviewError(null);
      setStakeQuoteDisplay(null);

      if (!publicKey) {
        if (cancelled) return;
        setStakePreviewError("Connect your wallet to stake.");
        setStakePreviewStatus("error");
        return;
      }

      let amount = typeof intent.amount === "number" ? intent.amount : null;

      // "unstake all" / "unstake my mSOL" → amount is null. Resolve to
      // the current balance from the staking status endpoint before
      // calling the preview.
      if (amount === null && intent.action === "unstake") {
        try {
          const statusRes = await fetch(
            `/api/stake/status?wallet=${encodeURIComponent(publicKey.toBase58())}`,
            { cache: "no-store" }
          );
          const statusJson = (await statusRes.json()) as
            | { success: true; data: { msolBalance: number; jitoBalance: number } }
            | { success: false; error?: string };
          if (cancelled) return;
          if (statusJson.success) {
            const bal =
              intent.provider === "jito"
                ? statusJson.data.jitoBalance
                : statusJson.data.msolBalance;
            if (bal > 0) {
              amount = bal;
              setPendingStake({ ...intent, amount: bal });
              return;
            }
            setStakePreviewError(
              `You have no ${intent.provider === "jito" ? "JitoSOL" : "mSOL"} to unstake.`
            );
            setStakePreviewStatus("error");
            return;
          }
        } catch {
          // fall through — show the generic "need an amount" error below
        }
      }

      if (amount === null) {
        if (cancelled) return;
        setStakePreviewError(
          intent.action === "unstake"
            ? "I need an amount to unstake. Try \"unstake 1 mSOL\"."
            : "I need a SOL amount to stake."
        );
        setStakePreviewStatus("error");
        return;
      }

      try {
        const res = await fetch("/api/stake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: intent.action,
            amount,
            provider: intent.provider,
            userPublicKey: publicKey.toBase58(),
            preview: true,
          }),
        });
        const json = (await res.json()) as
          | { success: true; data: { display: StakeQuoteDisplay } }
          | { success: false; error?: string };
        if (cancelled) return;
        if (!json.success) {
          setStakePreviewError(json.error ?? "Failed to fetch staking quote.");
          setStakePreviewStatus("error");
          return;
        }
        setStakeQuoteDisplay(json.data.display);
        setStakePreviewStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStakePreviewError(
          err instanceof Error ? err.message : "Failed to fetch staking quote."
        );
        setStakePreviewStatus("error");
      }
    }

    preflightStake(pendingStake);
    return () => {
      cancelled = true;
    };
  }, [pendingStake, publicKey]);

  useEffect(() => {
    if (!duePayment) return;
    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      text: `Scheduled payment due: ${duePayment.amount_sol} ${duePayment.token} → ${shortAddress(duePayment.recipient, 4, 4)} (${duePayment.label ?? duePayment.frequency}). Ready to execute.`,
      ts: Date.now(),
    });
    setPendingScheduledExec(duePayment);
    clearDue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duePayment]);

  useEffect(() => {
    if (!pendingScheduledExec) return;
    let cancelled = false;

    async function preflightScheduled(row: ScheduledPayment) {
      setScheduleExecStatus("building");
      setScheduleExecError(null);
      setScheduleExecFee(null);
      preparedScheduleRef.current = null;

      if (row.token !== "SOL") {
        if (cancelled) return;
        setScheduleExecError("Only SOL scheduled payments are supported right now.");
        setScheduleExecStatus("error");
        return;
      }

      try {
        if (!publicKey) throw new Error("Wallet not connected.");
        const toPubkey = new PublicKey(row.recipient);
        const built = await buildSolTransferTx({
          connection,
          from: publicKey,
          to: toPubkey,
          amountSol: row.amount_sol,
        });
        if (cancelled) return;
        preparedScheduleRef.current = {
          transaction: built.transaction,
          blockhashInfo: built.blockhashInfo,
        };
        setScheduleExecFee(built.feeLamports);
        setScheduleExecStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setScheduleExecError(
          err instanceof Error ? err.message : "Failed to build transaction."
        );
        setScheduleExecStatus("error");
      }
    }

    if (!publicKey) {
      setScheduleExecError("Connect your wallet to send.");
      setScheduleExecStatus("error");
      return;
    }
    preflightScheduled(pendingScheduledExec);
    return () => {
      cancelled = true;
    };
  }, [pendingScheduledExec, publicKey, connection]);

  // Sync preflight status into multiStepStatuses array
  useEffect(() => {
    if (!pendingMultiStep) return;
    const step = resolvedStepsRef.current[multiStepIndex];
    if (!step) return;
    const rawStatus = step.kind === "swap" ? swapPreviewStatus : previewStatus;
    setMultiStepStatuses((prev) => {
      const next = [...prev];
      const cur = next[multiStepIndex];
      if (cur === "building" && rawStatus === "ready") next[multiStepIndex] = "ready";
      if (cur === "building" && rawStatus === "error") next[multiStepIndex] = "error";
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapPreviewStatus, previewStatus, multiStepIndex, pendingMultiStep]);

  // Security scan triggers — run after preflight completes, before showing the modal
  useEffect(() => {
    if (previewStatus !== "ready" || !pendingSend || !publicKey) return;
    void runSecurityScan({
      type: "send",
      amount: pendingSend.amount,
      token: pendingSend.token,
      recipientPubkey: previewRecipientPubkey ?? pendingSend.recipient,
      programId: "11111111111111111111111111111111",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStatus]);

  useEffect(() => {
    if (swapPreviewStatus !== "ready" || !pendingSwap || !publicKey) return;
    void runSecurityScan({
      type: "swap",
      fromToken: pendingSwap.fromToken,
      toToken: pendingSwap.toToken,
      amount: pendingSwap.amount,
      priceImpact: swapQuoteDisplay?.priceImpactPct ?? 0,
      routeLabels: swapQuoteDisplay?.routeLabels ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapPreviewStatus]);

  useEffect(() => {
    if (stakePreviewStatus !== "ready" || !pendingStake || !publicKey) return;
    void runSecurityScan({
      type: "stake",
      amount: typeof pendingStake.amount === "number" ? pendingStake.amount : 0,
      provider: pendingStake.provider,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stakePreviewStatus]);

  // Auto-approve: fire confirm handlers as soon as preflight reaches "ready" (wait for scan)
  useEffect(() => {
    if (pendingMultiStep) return; // multi-step has its own auto-approve below
    if (autoApprove && previewStatus === "ready" && pendingSend && !isScanning) {
      handleConfirmSend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApprove, previewStatus, pendingSend, pendingMultiStep, isScanning]);

  useEffect(() => {
    if (pendingMultiStep) return;
    if (autoApprove && swapPreviewStatus === "ready" && pendingSwap && !isScanning) {
      handleConfirmSwap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApprove, swapPreviewStatus, pendingSwap, pendingMultiStep, isScanning]);

  useEffect(() => {
    if (pendingMultiStep) return;
    if (autoApprove && stakePreviewStatus === "ready" && pendingStake && !isScanning) {
      handleConfirmStake();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApprove, stakePreviewStatus, pendingStake, pendingMultiStep, isScanning]);

  useEffect(() => {
    if (autoApprove && scheduleExecStatus === "ready" && pendingScheduledExec) {
      handleConfirmScheduledExec();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApprove, scheduleExecStatus, pendingScheduledExec]);

  // Auto-approve for multi-step
  useEffect(() => {
    if (!pendingMultiStep || !autoApprove) return;
    const step = resolvedStepsRef.current[multiStepIndex];
    if (!step) return;
    const currentStatus = multiStepStatuses[multiStepIndex];
    if (currentStatus !== "ready") return;
    handleMultiStepConfirmCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApprove, multiStepStatuses, multiStepIndex, pendingMultiStep]);

  function persistMessage(sessionId: string, msg: Message) {
    if (msg.id === "welcome") return;

    // Instantly update title in the store so the sidebar reflects it without a reload
    if (msg.role === "user" && msg.text) {
      const currentSession = useChatSessionStore.getState().sessions.find((s) => s.id === sessionId);
      if (currentSession?.title === "New Chat") {
        const autoTitle = msg.text.length > 40 ? msg.text.slice(0, 40) + "…" : msg.text;
        updateSessionTitle(sessionId, autoTitle);
      }
    }

    const cardPayload = msg.receipt ?? msg.explanation ?? msg.insights ?? null;
    const row: Omit<ChatMessageRow, never> = {
      id: msg.id,
      session_id: sessionId,
      role: msg.role,
      text: msg.text ?? null,
      component: msg.component ?? null,
      receipt_json: cardPayload ? JSON.stringify(cardPayload) : null,
      history_limit: msg.historyLimit ?? null,
      ts: msg.ts,
    };
    fetch(`/api/chat-sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: row }),
    })
      .then(() => bumpSession(sessionId, Date.now()))
      .catch(() => {});
  }

  function appendMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
    const sid = useChatSessionStore.getState().activeSessionId;
    if (sid) persistMessage(sid, msg);
  }

  async function resolveRecipient(
    recipient: string,
    walletPubkey: string
  ): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
    try {
      new PublicKey(recipient);
      return { ok: true, address: recipient };
    } catch {
      // not a raw address — look up in contacts
    }
    try {
      const res = await fetch(
        `/api/contacts/resolve?wallet=${walletPubkey}&name=${encodeURIComponent(recipient)}`
      );
      const json = (await res.json()) as
        | { success: true; data: { address: string } }
        | { success: false; error?: string };
      if (json.success) return { ok: true, address: json.data.address };
      return {
        ok: false,
        error: `Unknown contact "${recipient}". Save it first: "save [address] as ${recipient}".`,
      };
    } catch {
      return { ok: false, error: `Failed to resolve contact "${recipient}".` };
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    const sid = useChatSessionStore.getState().activeSessionId;
    if (sid) persistMessage(sid, userMsg);
    setInput("");
    setBusy(true);

    try {
      const walletContext = {
        publicKey: publicKey?.toBase58(),
        solBalance: balance ?? undefined,
      };
      const res = await fetch("/api/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          walletContext,
          conversationHistory: buildConversationHistory(messages),
        }),
      });
      const data = (await res.json()) as
        | { success: true; data: Intent }
        | { success: false; error?: string };

      if (!data.success) {
        appendMessage({
          id: crypto.randomUUID(),
          role: "ai",
          text: data.error ?? "Something went wrong.",
          ts: Date.now(),
        });
      } else if (data.data.action === "send") {
        const sendIntent = data.data;
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet to send.", ts: Date.now() });
        } else {
          const resolved = await resolveRecipient(sendIntent.recipient, publicKey.toBase58());
          if (!resolved.ok) {
            appendMessage({ id: crypto.randomUUID(), role: "ai", text: resolved.error, ts: Date.now() });
          } else {
            const resolvedIntent: SendIntent = { ...sendIntent, recipient: resolved.address };
            appendMessage({
              id: crypto.randomUUID(),
              role: "ai",
              text: `Let's confirm this send of ${resolvedIntent.amount} ${resolvedIntent.token}.`,
              ts: Date.now(),
            });
            setPendingSend(resolvedIntent);
          }
        }
      } else if (data.data.action === "swap") {
        appendMessage({
          id: crypto.randomUUID(),
          role: "ai",
          text: `Getting a Jupiter quote for ${data.data.amount} ${data.data.fromToken} → ${data.data.toToken}…`,
          ts: Date.now(),
        });
        setPendingSwap(data.data);
      } else if (data.data.action === "save_contact") {
        const intent = data.data as SaveContactIntent;
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet to save contacts.", ts: Date.now() });
        } else {
          const res2 = await fetch("/api/contacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletPubkey: publicKey.toBase58(), name: intent.name, address: intent.address }),
          });
          const json2 = (await res2.json()) as { success: boolean; error?: string };
          appendMessage({
            id: crypto.randomUUID(),
            role: "ai",
            text: json2.success
              ? `Saved! "${intent.name}" is now in your address book.`
              : json2.error ?? "Failed to save contact.",
            ts: Date.now(),
          });
        }
      } else if (data.data.action === "list_contacts") {
        appendMessage({ id: crypto.randomUUID(), role: "ai", component: "contacts", ts: Date.now() });
      } else if (data.data.action === "delete_contact") {
        const intent = data.data as DeleteContactIntent;
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet to manage contacts.", ts: Date.now() });
        } else {
          const res2 = await fetch(
            `/api/contacts/${encodeURIComponent(intent.name)}?wallet=${publicKey.toBase58()}`,
            { method: "DELETE" }
          );
          const json2 = (await res2.json()) as { success: boolean; error?: string };
          appendMessage({
            id: crypto.randomUUID(),
            role: "ai",
            text: json2.success
              ? `Removed "${intent.name}" from your address book.`
              : json2.error ?? "Failed to remove contact.",
            ts: Date.now(),
          });
        }
      } else if (data.data.action === "schedule") {
        const intent = data.data;
        // Resolve contact name if recipient isn't a raw address
        if (publicKey) {
          const resolved = await resolveRecipient(intent.recipient, publicKey.toBase58());
          if (!resolved.ok) {
            appendMessage({ id: crypto.randomUUID(), role: "ai", text: resolved.error, ts: Date.now() });
            return;
          }
          (intent as typeof intent & { recipient: string }).recipient = resolved.address;
        }
        const res2 = await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent, walletPubkey: publicKey?.toBase58() }),
        });
        const json2 = (await res2.json()) as
          | { success: true; data: ScheduledPayment }
          | { success: false; error?: string };
        if (json2.success) {
          refreshSchedules();
          appendMessage({
            id: crypto.randomUUID(),
            role: "ai",
            text: `Scheduled! I'll remind you to send ${intent.amount} ${intent.token} — ${intent.label}.`,
            ts: Date.now(),
          });
        } else {
          appendMessage({
            id: crypto.randomUUID(),
            role: "ai",
            text: json2.error ?? "Failed to schedule payment.",
            ts: Date.now(),
          });
        }
      } else if (
        data.data.action === "view_schedules" ||
        data.data.action === "cancel_schedule"
      ) {
        appendMessage({
          id: crypto.randomUUID(),
          role: "ai",
          component: "schedules",
          ts: Date.now(),
        });
      } else if (data.data.action === "set_portfolio") {
        const intent = data.data as SetPortfolioIntent;
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet to set up portfolio management.", ts: Date.now() });
        } else {
          const res2 = await fetch("/api/portfolio/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              walletPubkey: publicKey.toBase58(),
              targets: intent.targets,
              drift_threshold: intent.drift_threshold ?? 5,
              auto_execute: intent.auto_execute ?? false,
            }),
          });
          const json2 = (await res2.json()) as { success: boolean; error?: string };
          if (json2.success) {
            const targetStr = intent.targets.map((t) => `${t.percentage}% ${t.token}`).join(", ");
            appendMessage({
              id: crypto.randomUUID(),
              role: "ai",
              text: `Portfolio target set: ${targetStr}. I'll monitor drift every 30 seconds and alert you when rebalancing is needed.`,
              ts: Date.now(),
            });
            appendMessage({ id: crypto.randomUUID(), role: "ai", component: "portfolio_manager", ts: Date.now() });
          } else {
            appendMessage({ id: crypto.randomUUID(), role: "ai", text: json2.error ?? "Failed to save portfolio config.", ts: Date.now() });
          }
        }
      } else if (data.data.action === "view_portfolio") {
        appendMessage({ id: crypto.randomUUID(), role: "ai", component: "portfolio_manager", ts: Date.now() });
      } else if (data.data.action === "pause_portfolio") {
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet first.", ts: Date.now() });
        } else {
          await updatePortfolioConfig({ is_active: false });
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Portfolio rebalancing paused. Type \"resume rebalancing\" to re-enable it.", ts: Date.now() });
        }
      } else if (data.data.action === "resume_portfolio") {
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet first.", ts: Date.now() });
        } else {
          await updatePortfolioConfig({ is_active: true });
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Portfolio rebalancing resumed! I'll monitor your allocations.", ts: Date.now() });
          appendMessage({ id: crypto.randomUUID(), role: "ai", component: "portfolio_manager", ts: Date.now() });
        }
      } else if (data.data.action === "set_drift_threshold") {
        const threshold = (data.data as { action: "set_drift_threshold"; threshold: number }).threshold;
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet first.", ts: Date.now() });
        } else {
          await updatePortfolioConfig({ drift_threshold: threshold });
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: `Drift threshold updated to ${threshold}%. I'll rebalance when any allocation drifts more than ${threshold}%.`, ts: Date.now() });
        }
      } else if (data.data.action === "dca") {
        const intent = data.data as DCAIntent;
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet to set up DCA.", ts: Date.now() });
        } else {
          const res2 = await fetch("/api/dca", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletPubkey: publicKey.toBase58(), intent }),
          });
          const json2 = (await res2.json()) as
            | { success: true; data: DCAOrder }
            | { success: false; error?: string };
          if (json2.success) {
            await refreshDCA();
            const durationStr = intent.duration
              ? ` for ${intent.duration} runs`
              : "";
            appendMessage({
              id: crypto.randomUUID(),
              role: "ai",
              text: `DCA set up: $${intent.amountUsd} ${intent.inputToken} → ${intent.outputToken} ${intent.interval}${durationStr}.`,
              ts: Date.now(),
            });
            appendMessage({ id: crypto.randomUUID(), role: "ai", component: "dca_manager", ts: Date.now() });
          } else {
            appendMessage({ id: crypto.randomUUID(), role: "ai", text: json2.error ?? "Failed to create DCA order.", ts: Date.now() });
          }
        }
      } else if (data.data.action === "view_dca") {
        appendMessage({ id: crypto.randomUUID(), role: "ai", component: "dca_manager", ts: Date.now() });
      } else if (data.data.action === "cancel_dca") {
        const intent = data.data as CancelDCAIntent;
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet first.", ts: Date.now() });
        } else if (!intent.id) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", component: "dca_manager", ts: Date.now() });
        } else {
          const ok = await cancelDCAOrder(intent.id);
          appendMessage({
            id: crypto.randomUUID(),
            role: "ai",
            text: ok ? "DCA cancelled." : "Couldn't cancel that DCA order.",
            ts: Date.now(),
          });
        }
      } else if (data.data.action === "price_alert") {
        const intent = data.data as PriceAlertIntent;
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet to create price alerts.", ts: Date.now() });
        } else {
          const res2 = await fetch("/api/price-alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletPubkey: publicKey.toBase58(), intent }),
          });
          const json2 = (await res2.json()) as
            | { success: true; data: PriceAlert }
            | { success: false; error?: string };
          if (json2.success) {
            await refreshDCA();
            appendMessage({
              id: crypto.randomUUID(),
              role: "ai",
              text: `I'll watch ${intent.token} and ping you when it goes ${intent.direction} $${intent.targetPrice}.`,
              ts: Date.now(),
            });
          } else {
            appendMessage({ id: crypto.randomUUID(), role: "ai", text: json2.error ?? "Failed to create alert.", ts: Date.now() });
          }
        }
      } else if (data.data.action === "multi_step") {
        const msIntent = data.data as MultiStepIntent;
        appendMessage({
          id: crypto.randomUUID(),
          role: "ai",
          text: `Starting multi-step: ${msIntent.description}`,
          ts: Date.now(),
        });
        await executeMultiStep(msIntent);
      } else if (data.data.action === "stake" || data.data.action === "unstake") {
        const stakeIntent = data.data;
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet to stake.", ts: Date.now() });
        } else {
          const providerLabel = stakeIntent.provider === "jito" ? "Jito" : "Marinade";
          const actionLabel = stakeIntent.action === "stake" ? "stake" : "unstake";
          const amtLabel =
            typeof stakeIntent.amount === "number"
              ? `${stakeIntent.amount} ${stakeIntent.action === "stake" ? "SOL" : stakeIntent.provider === "jito" ? "JitoSOL" : "mSOL"}`
              : "your full balance";
          appendMessage({
            id: crypto.randomUUID(),
            role: "ai",
            text: `Preparing ${providerLabel} ${actionLabel} for ${amtLabel}…`,
            ts: Date.now(),
          });
          setPendingStake(stakeIntent);
        }
      } else if (data.data.action === "staking_status") {
        appendMessage({ id: crypto.randomUUID(), role: "ai", component: "staking", ts: Date.now() });
      } else if (data.data.action === "explain_tx") {
        const intent = data.data as ExplainTxIntent;
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet so I know which one to frame this from.", ts: Date.now() });
        } else {
          appendMessage({
            id: crypto.randomUUID(),
            role: "ai",
            text: `Looking up ${shortAddress(intent.signature, 8, 8)}…`,
            ts: Date.now(),
          });
          const res2 = await fetch("/api/explain-tx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signature: intent.signature, walletPubkey: publicKey.toBase58() }),
          });
          const json2 = (await res2.json()) as
            | { success: true; data: ExplanationCardProps }
            | { success: false; error?: string };
          if (json2.success) {
            appendMessage({
              id: crypto.randomUUID(),
              role: "ai",
              component: "explanation",
              explanation: json2.data,
              ts: Date.now(),
            });
          } else {
            appendMessage({
              id: crypto.randomUUID(),
              role: "ai",
              text: json2.error ?? "Couldn't explain that transaction.",
              ts: Date.now(),
            });
          }
        }
      } else if (data.data.action === "spending_insights") {
        if (!publicKey) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet so I can analyze its activity.", ts: Date.now() });
        } else {
          appendMessage({
            id: crypto.randomUUID(),
            role: "ai",
            text: "Analyzing your last 20 transactions…",
            ts: Date.now(),
          });
          const res2 = await fetch("/api/spending-insights", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletPubkey: publicKey.toBase58() }),
          });
          const json2 = (await res2.json()) as
            | { success: true; data: InsightsPayload }
            | { success: false; error?: string };
          if (json2.success) {
            appendMessage({
              id: crypto.randomUUID(),
              role: "ai",
              component: "insights",
              insights: json2.data,
              ts: Date.now(),
            });
          } else {
            appendMessage({
              id: crypto.randomUUID(),
              role: "ai",
              text: json2.error ?? "Couldn't pull spending insights right now.",
              ts: Date.now(),
            });
          }
        }
      } else {
        appendMessage(intentToMessage(data.data));
      }
    } catch {
      appendMessage({
        id: crypto.randomUUID(),
        role: "ai",
        text: "Couldn't reach the AI. Check your API key in .env.local.",
        ts: Date.now(),
      });
    } finally {
      setBusy(false);
    }
  }

  function handleCancelPreview() {
    const activeStatus = pendingStake
      ? stakePreviewStatus
      : pendingSwap
        ? swapPreviewStatus
        : previewStatus;
    if (
      activeStatus === "sending" ||
      activeStatus === "confirming" ||
      activeStatus === "signing"
    ) {
      return;
    }
    setPendingSend(null);
    setPendingSwap(null);
    setPendingStake(null);
    preparedTxRef.current = null;
    preparedSwapRef.current = null;
    setSecurityAnalysis(null);
    setIsScanning(false);
    setOrbState("idle");
    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      text: "Cancelled. No transaction was sent.",
      ts: Date.now(),
    });
  }

  async function handleConfirmSend(): Promise<boolean> {
    const prepared = preparedTxRef.current;
    const intent = pendingSend;
    if (!prepared || !intent || !publicKey) return false;

    setPreviewStatus("signing");

    let signature: string;
    try {
      signature = await sendTransaction(prepared.transaction, connection);
      setPreviewStatus("confirming");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction rejected.";
      multiStepLastErrorRef.current = msg;
      setPreviewError(msg);
      setPreviewStatus("error");
      return false;
    }

    try {
      const result = await connection.confirmTransaction(
        {
          signature,
          blockhash: prepared.blockhashInfo.blockhash,
          lastValidBlockHeight: prepared.blockhashInfo.lastValidBlockHeight,
        },
        "confirmed"
      );
      if (result.value.err) {
        throw new Error(
          typeof result.value.err === "string"
            ? result.value.err
            : "Transaction failed on chain."
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed.";
      multiStepLastErrorRef.current = msg;
      setPreviewError(msg);
      setPreviewStatus("error");
      return false;
    }

    setPendingSend(null);
    preparedTxRef.current = null;

    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      component: "receipt",
      receipt: {
        kind: "send",
        signature,
        amount: intent.amount,
        token: intent.token,
        recipient: previewRecipientPubkey ?? intent.recipient,
        network: SOLANA_NETWORK,
      },
      ts: Date.now(),
    });
    return true;
  }

  async function handleConfirmSwap(): Promise<boolean> {
    const prepared = preparedSwapRef.current;
    if (!prepared || !pendingSwap || !publicKey) return false;

    setSwapPreviewStatus("signing");

    let transaction: VersionedTransaction;
    let lastValidBlockHeight: number;
    try {
      const res = await fetch("/api/swap-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote: prepared.quote,
          userPublicKey: publicKey.toBase58(),
        }),
      });
      const json = (await res.json()) as
        | {
            success: true;
            data: {
              swapTransaction: string;
              lastValidBlockHeight: number;
            };
          }
        | { success: false; error?: string };
      if (!json.success) {
        throw new Error(json.error ?? "Failed to build swap transaction.");
      }
      transaction = deserializeSwapTx(json.data.swapTransaction);
      lastValidBlockHeight = json.data.lastValidBlockHeight;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to build swap transaction.";
      multiStepLastErrorRef.current = msg;
      setSwapPreviewError(msg);
      setSwapPreviewStatus("error");
      return false;
    }

    let signature: string;
    try {
      signature = await sendTransaction(transaction, connection);
      setSwapPreviewStatus("confirming");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Swap rejected.";
      multiStepLastErrorRef.current = msg;
      setSwapPreviewError(msg);
      setSwapPreviewStatus("error");
      return false;
    }

    try {
      const blockhash = transaction.message.recentBlockhash;
      const result = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      if (result.value.err) {
        throw new Error(
          typeof result.value.err === "string"
            ? result.value.err
            : "Swap failed on chain."
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Swap failed.";
      multiStepLastErrorRef.current = msg;
      setSwapPreviewError(msg);
      setSwapPreviewStatus("error");
      return false;
    }

    const receipt: ReceiptPayload = {
      kind: "swap",
      signature,
      fromAmount: prepared.inUiAmount,
      fromToken: prepared.fromSymbol,
      toAmount: prepared.outUiAmount,
      toToken: prepared.toSymbol,
      network: SOLANA_NETWORK,
    };

    setPendingSwap(null);
    preparedSwapRef.current = null;

    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      component: "receipt",
      receipt,
      ts: Date.now(),
    });
    return true;
  }

  async function handleConfirmStake(): Promise<boolean> {
    const intent = pendingStake;
    const display = stakeQuoteDisplay;
    if (!intent || !publicKey || typeof intent.amount !== "number") return false;

    setStakePreviewStatus("signing");

    let transaction: Transaction;
    let lastValidBlockHeight: number;
    let finalDisplay: StakeQuoteDisplay;
    try {
      const res = await fetch("/api/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: intent.action,
          amount: intent.amount,
          provider: intent.provider,
          userPublicKey: publicKey.toBase58(),
        }),
      });
      const json = (await res.json()) as
        | {
            success: true;
            data: {
              stakeTransaction: string;
              lastValidBlockHeight: number;
              display: StakeQuoteDisplay;
            };
          }
        | { success: false; error?: string };
      if (!json.success) {
        throw new Error(json.error ?? "Failed to build staking transaction.");
      }
      transaction = deserializeLegacyTx(json.data.stakeTransaction);
      lastValidBlockHeight = json.data.lastValidBlockHeight;
      finalDisplay = json.data.display;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to build staking transaction.";
      setStakePreviewError(msg);
      setStakePreviewStatus("error");
      return false;
    }

    let signature: string;
    try {
      signature = await sendTransaction(transaction, connection);
      setStakePreviewStatus("confirming");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction rejected.";
      setStakePreviewError(msg);
      setStakePreviewStatus("error");
      return false;
    }

    try {
      const blockhash = transaction.recentBlockhash;
      if (!blockhash) throw new Error("Missing blockhash on signed transaction.");
      const result = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      if (result.value.err) {
        throw new Error(
          typeof result.value.err === "string"
            ? result.value.err
            : "Transaction failed on chain."
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed.";
      setStakePreviewError(msg);
      setStakePreviewStatus("error");
      return false;
    }

    const receipt: ReceiptPayload = {
      kind: intent.action,
      signature,
      provider: intent.provider,
      inputAmount: finalDisplay.inputAmount ?? display?.inputAmount ?? intent.amount,
      outputAmount: finalDisplay.outputAmount ?? display?.outputAmount ?? 0,
      network: SOLANA_NETWORK,
    };

    setPendingStake(null);

    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      component: "receipt",
      receipt,
      ts: Date.now(),
    });
    return true;
  }

  async function handleConfirmScheduledExec() {
    const prepared = preparedScheduleRef.current;
    const row = pendingScheduledExec;
    if (!prepared || !row || !publicKey) return;

    setScheduleExecStatus("signing");

    let signature: string;
    try {
      signature = await sendTransaction(prepared.transaction, connection);
      setScheduleExecStatus("confirming");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction rejected.";
      setScheduleExecError(msg);
      setScheduleExecStatus("error");
      return;
    }

    try {
      const result = await connection.confirmTransaction(
        {
          signature,
          blockhash: prepared.blockhashInfo.blockhash,
          lastValidBlockHeight: prepared.blockhashInfo.lastValidBlockHeight,
        },
        "confirmed"
      );
      if (result.value.err) {
        throw new Error("Transaction failed on chain.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed.";
      setScheduleExecError(msg);
      setScheduleExecStatus("error");
      return;
    }

    try {
      await fetch(`/api/schedules/${row.id}/executed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletPubkey: publicKey.toBase58(), signature }),
      });
    } catch {
      // non-fatal — tx already confirmed on chain
    }

    setPendingScheduledExec(null);
    preparedScheduleRef.current = null;
    refreshSchedules();

    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      component: "receipt",
      receipt: {
        kind: "send",
        signature,
        amount: row.amount_sol,
        token: row.token,
        recipient: row.recipient,
        network: SOLANA_NETWORK,
      },
      ts: Date.now(),
    });
  }

  function handleCancelScheduledExec() {
    if (
      scheduleExecStatus === "signing" ||
      scheduleExecStatus === "sending" ||
      scheduleExecStatus === "confirming"
    )
      return;
    setPendingScheduledExec(null);
    preparedScheduleRef.current = null;
    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      text: "Scheduled payment skipped for now.",
      ts: Date.now(),
    });
  }

  async function handleCancelSchedule(id: string) {
    if (!publicKey) return;
    const res = await fetch(`/api/schedules/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletPubkey: publicKey.toBase58() }),
    });
    if (res.ok) {
      refreshSchedules();
      appendMessage({
        id: crypto.randomUUID(),
        role: "ai",
        text: "Scheduled payment cancelled.",
        ts: Date.now(),
      });
    }
  }

  // --- Multi-step helpers ---

  function updateStepStatus(index: number, status: StepRunStatus) {
    setMultiStepStatuses((prev) => {
      const next = [...prev];
      next[index] = status;
      return next;
    });
  }

  function startStep(index: number) {
    setMultiStepIndex(index);
    updateStepStatus(index, "building");
    const step = resolvedStepsRef.current[index];
    if (!step) return;
    if (step.kind === "swap") {
      setPendingSwap(step.swapIntent!);
    } else if (step.kind === "send") {
      setPendingSend(step.sendIntent!);
    } else {
      // Display step — show result immediately, no confirmation needed
      if (step.displayKind === "history") {
        appendMessage({ id: crypto.randomUUID(), role: "ai", component: "history", historyLimit: step.historyLimit ?? 5, ts: Date.now() });
      } else {
        appendMessage({ id: crypto.randomUUID(), role: "ai", component: "portfolio", ts: Date.now() });
      }
      setTimeout(() => {
        updateStepStatus(index, "done");
        const nextIndex = index + 1;
        if (nextIndex >= resolvedStepsRef.current.length) {
          setPendingMultiStep(null);
          return;
        }
        startStep(nextIndex);
      }, 0);
    }
  }

  async function handleMultiStepConfirmCurrent() {
    const index = multiStepIndex;
    const step = resolvedStepsRef.current[index];
    if (!step) return;

    multiStepLastErrorRef.current = null;
    updateStepStatus(index, "signing");

    let success: boolean;
    if (step.kind === "swap") {
      // Capture outAmount before handleConfirmSwap clears preparedSwapRef
      if (preparedSwapRef.current) {
        capturedSwapOutRef.current = {
          outUiAmount: preparedSwapRef.current.outUiAmount,
          toToken: preparedSwapRef.current.toSymbol,
        };
      }
      success = await handleConfirmSwap();
    } else {
      success = await handleConfirmSend();
    }

    if (multiStepAbortRef.current) return;

    if (!success) {
      updateStepStatus(index, "error");
      setMultiStepError(multiStepLastErrorRef.current ?? "Step failed.");
      return;
    }

    updateStepStatus(index, "done");

    const nextIndex = index + 1;
    if (nextIndex >= resolvedStepsRef.current.length) {
      setPendingMultiStep(null);
      appendMessage({
        id: crypto.randomUUID(),
        role: "ai",
        text: `All ${resolvedStepsRef.current.length} steps completed successfully.`,
        ts: Date.now(),
      });
      return;
    }

    // Chain swap output to next send step if needed
    const nextStep = resolvedStepsRef.current[nextIndex];
    if (nextStep.chainAmount && capturedSwapOutRef.current) {
      nextStep.sendIntent = {
        ...nextStep.sendIntent!,
        amount: capturedSwapOutRef.current.outUiAmount,
        token: capturedSwapOutRef.current.toToken,
      };
      capturedSwapOutRef.current = null;
    }

    startStep(nextIndex);
  }

  function handleCancelMultiStep() {
    const activeStatus = multiStepStatuses[multiStepIndex];
    if (activeStatus === "signing" || activeStatus === "confirming") return;
    multiStepAbortRef.current = true;
    setPendingMultiStep(null);
    setPendingSend(null);
    setPendingSwap(null);
    preparedTxRef.current = null;
    preparedSwapRef.current = null;
    capturedSwapOutRef.current = null;
    resolvedStepsRef.current = [];
    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      text: "Multi-step command cancelled. No transactions were sent.",
      ts: Date.now(),
    });
  }

  async function executeMultiStep(intent: MultiStepIntent) {
    if (!publicKey) {
      appendMessage({ id: crypto.randomUUID(), role: "ai", text: "Connect your wallet to execute multi-step commands.", ts: Date.now() });
      return;
    }

    multiStepAbortRef.current = false;

    // Phase 1: resolve all send recipients up-front before showing any UI
    const resolved: ResolvedStep[] = [];
    for (const step of intent.steps) {
      if (step.type === "send") {
        const r = await resolveRecipient(step.recipient, publicKey.toBase58());
        if (!r.ok) {
          appendMessage({ id: crypto.randomUUID(), role: "ai", text: r.error, ts: Date.now() });
          return;
        }
        resolved.push({
          kind: "send",
          sendIntent: {
            action: "send",
            amount: step.amount ?? 0,
            token: step.token,
            recipient: r.address,
            memo: step.memo,
          },
          chainAmount: step.amount === null,
        });
      } else if (step.type === "history") {
        resolved.push({ kind: "display", displayKind: "history", historyLimit: step.limit ?? 5 });
      } else if (step.type === "balance") {
        resolved.push({ kind: "display", displayKind: "balance" });
      } else {
        resolved.push({
          kind: "swap",
          swapIntent: {
            action: "swap",
            fromToken: step.fromToken,
            toToken: step.toToken,
            amount: step.amount,
            slippageBps: step.slippageBps ?? 50,
          },
        });
      }
    }

    resolvedStepsRef.current = resolved;

    // Phase 2: show preview and kick off step 0
    setMultiStepError(null);
    setMultiStepStatuses(resolved.map(() => "pending" as StepRunStatus));
    setPendingMultiStep(intent);
    setMultiStepIndex(0);
    startStep(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] flex-shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-white/30">AI Wallet</span>
        <AutoApproveToggle autoApprove={autoApprove} onToggle={toggleAutoApprove} />
      </div>

      {/* Messages */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 overflow-y-auto space-y-5 px-4 py-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              scheduledPayments={schedules}
              schedulesLoading={schedulesLoading}
              onCancelSchedule={handleCancelSchedule}
              walletPubkey={publicKey?.toBase58() ?? null}
              portfolioConfig={portfolioConfig}
              portfolioStatus={portfolioStatus}
              isRebalancing={isRebalancing}
              portfolioPendingSwaps={portfolioMsgIds.includes(msg.id) ? portfolioPendingSwaps : null}
              rebalanceReasoning={rebalanceReasoning}
              portfolioError={portfolioError}
              onTriggerRebalance={triggerRebalance}
              onConfirmRebalanceSwaps={async () => {
                if (!portfolioPendingSwaps) return;
                for (const swap of portfolioPendingSwaps) {
                  const ok = await executeRebalanceSwap(swap);
                  if (!ok) break;
                }
                await fetch("/api/portfolio/config", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ walletPubkey: publicKey?.toBase58(), last_rebalanced_at: Date.now() }),
                });
                dismissPendingSwaps();
              }}
              onDismissRebalanceSwaps={dismissPendingSwaps}
              onToggleAutoExecute={(val) => updatePortfolioConfig({ auto_execute: val })}
              onToggleActive={(val) => updatePortfolioConfig({ is_active: val })}
              onUnstakeRequest={requestUnstake}
              dcaOrders={dcaOrders}
              priceAlerts={priceAlerts}
              dcaLoading={dcaLoading}
              dcaNetworkWarning={
                SOLANA_NETWORK !== "mainnet-beta"
                  ? `DCA swaps require mainnet-beta. Current network: ${SOLANA_NETWORK}. Orders are saved but won't execute until you switch networks.`
                  : null
              }
              onCancelDCA={(id) => {
                void cancelDCAOrder(id);
              }}
              onDeleteAlert={(id) => {
                void deletePriceAlert(id);
              }}
            />
          ))}
          {busy && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
        {/* Top fade */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[#080910] to-transparent" />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && !busy && (
        <div className="flex flex-wrap gap-2 px-4 py-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-white/50 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="relative flex-shrink-0 px-4 pb-4 pt-2">
        <div className="relative flex items-end gap-2 rounded-2xl border border-white/10 bg-black/50 p-2.5 backdrop-blur-2xl">
          <VoiceWaveform
            visible={voice.state === "listening"}
            label={voice.interimTranscript || "Listening…"}
          />
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              connected
                ? "Ask anything about your wallet…"
                : "Connect wallet to get started…"
            }
            disabled={!connected || busy || !!pendingMultiStep}
            className="flex-1 resize-none bg-transparent text-sm text-white/90 placeholder:text-white/25 outline-none py-1.5 px-2 min-h-[36px] max-h-[120px] disabled:opacity-40"
          />
          <VoiceInputButton
            state={voice.state}
            isSupported={voice.isSupported}
            onClick={voice.toggle}
            disabled={!connected || busy || !!pendingMultiStep}
          />
          <ShimmerButton
            onClick={() => send(input)}
            disabled={!input.trim() || busy || !connected || !!pendingMultiStep}
            shimmerColor="#a5b4fc"
            background="rgba(99, 102, 241, 0.2)"
            borderRadius="12px"
            className="shrink-0 h-9 w-9 p-0 border-indigo-500/20 disabled:opacity-30"
          >
            <SendIcon />
          </ShimmerButton>
          <BorderBeam
            size={100}
            duration={6}
            colorFrom="#6366f1"
            colorTo="#a78bfa"
            borderWidth={1}
          />
        </div>
        <p className="mt-1.5 text-center text-[10px] text-white/20">
          Shift+Enter for new line · Enter to send
        </p>
      </div>

      <SecurityScanOverlay visible={isScanning} analysis={securityAnalysis} />

      {pendingMultiStep ? (
        <MultiStepPreview
          intent={pendingMultiStep}
          statuses={multiStepStatuses}
          currentIndex={multiStepIndex}
          errorMessage={multiStepError}
          swapQuote={resolvedStepsRef.current[multiStepIndex]?.kind === "swap" ? swapQuoteDisplay : null}
          sendFeeLamports={resolvedStepsRef.current[multiStepIndex]?.kind === "send" ? previewFeeLamports : null}
          resolvedRecipient={resolvedStepsRef.current[multiStepIndex]?.kind === "send" ? previewRecipientPubkey : null}
          onConfirmStep={handleMultiStepConfirmCurrent}
          onCancel={handleCancelMultiStep}
        />
      ) : pendingSend ? (
        <TransactionPreview
          intent={pendingSend}
          status={previewStatus}
          errorMessage={previewError}
          feeLamports={previewFeeLamports}
          recipientPubkey={previewRecipientPubkey}
          analysis={securityAnalysis}
          onConfirm={handleConfirmSend}
          onCancel={handleCancelPreview}
        />
      ) : pendingSwap ? (
        <TransactionPreview
          intent={pendingSwap}
          status={swapPreviewStatus}
          errorMessage={swapPreviewError}
          quote={swapQuoteDisplay}
          analysis={securityAnalysis}
          onConfirm={handleConfirmSwap}
          onCancel={handleCancelPreview}
        />
      ) : pendingStake ? (
        <TransactionPreview
          intent={pendingStake}
          status={stakePreviewStatus}
          errorMessage={stakePreviewError}
          quote={stakeQuoteDisplay}
          analysis={securityAnalysis}
          onConfirm={handleConfirmStake}
          onCancel={handleCancelPreview}
        />
      ) : pendingScheduledExec ? (
        <TransactionPreview
          intent={{
            action: "send",
            amount: pendingScheduledExec.amount_sol,
            token: pendingScheduledExec.token,
            recipient: pendingScheduledExec.recipient,
          }}
          status={scheduleExecStatus}
          errorMessage={scheduleExecError}
          feeLamports={scheduleExecFee}
          recipientPubkey={pendingScheduledExec.recipient}
          onConfirm={handleConfirmScheduledExec}
          onCancel={handleCancelScheduledExec}
        />
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  scheduledPayments,
  schedulesLoading,
  onCancelSchedule,
  walletPubkey,
  portfolioConfig,
  portfolioStatus,
  isRebalancing,
  portfolioPendingSwaps,
  rebalanceReasoning,
  portfolioError,
  onTriggerRebalance,
  onConfirmRebalanceSwaps,
  onDismissRebalanceSwaps,
  onToggleAutoExecute,
  onToggleActive,
  onUnstakeRequest,
  dcaOrders,
  priceAlerts,
  dcaLoading,
  dcaNetworkWarning,
  onCancelDCA,
  onDeleteAlert,
}: {
  message: Message;
  scheduledPayments: ScheduledPayment[];
  schedulesLoading: boolean;
  onCancelSchedule: (id: string) => void;
  walletPubkey: string | null;
  portfolioConfig: import("@/types/intent").PortfolioConfig | null;
  portfolioStatus: import("@/types/intent").PortfolioStatus | null;
  isRebalancing: boolean;
  portfolioPendingSwaps: RebalanceSwap[] | null;
  rebalanceReasoning: string | null;
  portfolioError: string | null;
  onTriggerRebalance: () => void;
  onConfirmRebalanceSwaps: () => void;
  onDismissRebalanceSwaps: () => void;
  onToggleAutoExecute: (val: boolean) => void;
  onToggleActive: (val: boolean) => void;
  onUnstakeRequest: (provider: StakingProvider, amount: number) => void;
  dcaOrders: DCAOrder[];
  priceAlerts: PriceAlert[];
  dcaLoading: boolean;
  dcaNetworkWarning: string | null;
  onCancelDCA: (id: string) => void;
  onDeleteAlert: (id: string) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3 items-start", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold mt-0.5",
          isUser
            ? "bg-indigo-500/20 border border-indigo-500/30 text-indigo-300"
            : "bg-white/[0.06] border border-white/10"
        )}
      >
        {isUser ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="#818cf8" strokeWidth="1.5" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L20.5 7V17L12 22L3.5 17V7L12 2Z" stroke="#a78bfa" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2.5" fill="#a78bfa" />
          </svg>
        )}
      </div>
      {message.component === "portfolio" ? (
        <div className="max-w-[85%] flex-1">
          <PortfolioCard />
        </div>
      ) : message.component === "history" ? (
        <div className="max-w-[85%] flex-1">
          <TransactionHistoryCard limit={message.historyLimit ?? 5} />
        </div>
      ) : message.component === "receipt" && message.receipt ? (
        <div className="max-w-[85%] flex-1">
          <ReceiptCard {...message.receipt} />
        </div>
      ) : message.component === "schedules" ? (
        <div className="max-w-[90%] flex-1">
          <ScheduledPaymentsCard
            schedules={scheduledPayments}
            onCancel={onCancelSchedule}
            loading={schedulesLoading}
          />
        </div>
      ) : message.component === "contacts" ? (
        <div className="max-w-[90%] flex-1">
          <ContactsCard walletPubkey={walletPubkey} />
        </div>
      ) : message.component === "portfolio_manager" ? (
        <div className="max-w-[90%] flex-1">
          <PortfolioManagerCard
            config={portfolioConfig}
            status={portfolioStatus}
            isRebalancing={isRebalancing}
            pendingSwaps={portfolioPendingSwaps}
            rebalanceReasoning={rebalanceReasoning}
            error={portfolioError}
            onTriggerRebalance={onTriggerRebalance}
            onConfirmSwaps={onConfirmRebalanceSwaps}
            onDismissSwaps={onDismissRebalanceSwaps}
            onToggleAutoExecute={onToggleAutoExecute}
            onToggleActive={onToggleActive}
          />
        </div>
      ) : message.component === "staking" ? (
        <div className="max-w-[90%] flex-1">
          <StakingCard onUnstakeRequest={onUnstakeRequest} />
        </div>
      ) : message.component === "explanation" && message.explanation ? (
        <div className="max-w-[90%] flex-1">
          <ExplanationCard {...message.explanation} />
        </div>
      ) : message.component === "insights" && message.insights ? (
        <div className="max-w-[90%] flex-1">
          <InsightsCard data={message.insights} />
        </div>
      ) : message.component === "dca_manager" ? (
        <div className="max-w-[90%] flex-1">
          <DCACard
            orders={dcaOrders}
            alerts={priceAlerts}
            onCancelOrder={onCancelDCA}
            onDeleteAlert={onDeleteAlert}
            loading={dcaLoading}
            networkWarning={dcaNetworkWarning}
          />
        </div>
      ) : (
        <div
          className={cn(
            "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
            isUser
              ? "rounded-tr-none bg-indigo-600/15 text-white/90 border border-indigo-500/20"
              : "rounded-tl-none bg-white/[0.04] text-white/80 border border-white/[0.07]"
          )}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] border border-white/10 mt-0.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L20.5 7V17L12 22L3.5 17V7L12 2Z" stroke="#a78bfa" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.5" fill="#a78bfa" />
        </svg>
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-none border border-white/[0.07] bg-white/[0.04] px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-indigo-400/70 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function intentToMessage(intent: Intent): Message {
  const base = { id: crypto.randomUUID(), role: "ai" as const, ts: Date.now() };
  switch (intent.action) {
    case "balance":
      return { ...base, component: "portfolio" };
    case "send":
      return {
        ...base,
        text: `Got it! Preparing to send ${intent.amount} ${intent.token} to ${intent.recipient}.`,
      };
    case "swap":
      return {
        ...base,
        text: `Getting a Jupiter quote for ${intent.amount} ${intent.fromToken} → ${intent.toToken}…`,
      };
    case "history":
      return {
        ...base,
        component: "history",
        historyLimit: intent.limit ?? 5,
      };
    case "unknown":
      return { ...base, text: intent.clarification };
    case "schedule":
      return { ...base, text: `Scheduling ${intent.amount} ${intent.token} — ${intent.label}.` };
    case "view_schedules":
    case "cancel_schedule":
      return { ...base, component: "schedules" as const };
    case "list_contacts":
      return { ...base, component: "contacts" as const };
    case "save_contact":
    case "delete_contact":
      return { ...base, text: "Processing contact request…" };
    case "multi_step":
      return { ...base, text: `Starting multi-step: ${intent.description}` };
    case "set_portfolio":
    case "view_portfolio":
    case "pause_portfolio":
    case "resume_portfolio":
      return { ...base, component: "portfolio_manager" as const };
    case "set_drift_threshold":
      return { ...base, text: `Drift threshold updated to ${intent.threshold}%.` };
    case "stake":
    case "unstake":
      return { ...base, text: `Preparing ${intent.provider === "jito" ? "Jito" : "Marinade"} ${intent.action}…` };
    case "staking_status":
      return { ...base, component: "staking" as const };
    case "explain_tx":
      return { ...base, text: `Looking up transaction ${shortAddress(intent.signature, 8, 8)}…` };
    case "spending_insights":
      return { ...base, text: "Analyzing your recent transactions…" };
    case "dca":
      return { ...base, text: `Setting up DCA: $${intent.amountUsd} ${intent.inputToken} → ${intent.outputToken} ${intent.interval}.` };
    case "view_dca":
    case "cancel_dca":
      return { ...base, component: "dca_manager" as const };
    case "price_alert":
      return { ...base, text: `Alert created: ${intent.token} ${intent.direction} $${intent.targetPrice}.` };
  }
}
