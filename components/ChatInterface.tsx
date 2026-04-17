"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { VersionedTransaction } from "@solana/web3.js";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";
import { PortfolioCard } from "@/components/PortfolioCard";
import { ReceiptCard } from "@/components/ReceiptCard";
import {
  TransactionPreview,
  type PreviewStatus,
  type SwapQuoteDisplay,
} from "@/components/TransactionPreview";
import { useOrbStore } from "@/lib/stores/orbStore";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import {
  buildSolTransferTx,
  deserializeSwapTx,
  validateRecipient,
} from "@/lib/transactionBuilder";
import { SOLANA_NETWORK, type SolanaNetwork } from "@/lib/solanaClient";
import type { JupiterQuote } from "@/lib/jupiterClient";
import type { Intent, SendIntent, SwapIntent } from "@/types/intent";
import { cn } from "@/lib/utils";

type Role = "user" | "ai";
type MessageComponent = "portfolio" | "receipt";

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
    };

interface Message {
  id: string;
  role: Role;
  text?: string;
  component?: MessageComponent;
  receipt?: ReceiptPayload;
  ts: number;
}

const WELCOME: Message = {
  id: "welcome",
  role: "ai",
  text: "Hey! I'm your AI wallet assistant. Connect a Phantom wallet and try:\n\u2022 \"What's my balance?\"\n\u2022 \"Swap 10 USDC for SOL\"\n\u2022 \"Send 0.1 SOL to alice.sol\"",
  ts: Date.now(),
};

const SUGGESTIONS = [
  "What's my balance?",
  "Swap 10 USDC for SOL",
  "Send 0.1 SOL to alice.sol",
  "Show my last 5 transactions",
];

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

export function ChatInterface() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { balance } = useWalletBalance();
  const setOrbStatus = useOrbStore((s) => s.setOrbState);

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const orbResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (orbResetTimerRef.current) clearTimeout(orbResetTimerRef.current);
    };
  }, []);

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

  function scheduleOrbReset(delayMs = 2000) {
    if (orbResetTimerRef.current) clearTimeout(orbResetTimerRef.current);
    orbResetTimerRef.current = setTimeout(() => {
      setOrbStatus("idle");
      orbResetTimerRef.current = null;
    }, delayMs);
  }

  function appendMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
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
        body: JSON.stringify({ message: trimmed, walletContext }),
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
        appendMessage({
          id: crypto.randomUUID(),
          role: "ai",
          text: `Let's confirm this send of ${data.data.amount} ${data.data.token}.`,
          ts: Date.now(),
        });
        setPendingSend(data.data);
      } else if (data.data.action === "swap") {
        appendMessage({
          id: crypto.randomUUID(),
          role: "ai",
          text: `Getting a Jupiter quote for ${data.data.amount} ${data.data.fromToken} → ${data.data.toToken}…`,
          ts: Date.now(),
        });
        setPendingSwap(data.data);
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
    const activeStatus = pendingSwap ? swapPreviewStatus : previewStatus;
    if (
      activeStatus === "sending" ||
      activeStatus === "confirming" ||
      activeStatus === "signing"
    ) {
      return;
    }
    setPendingSend(null);
    setPendingSwap(null);
    preparedTxRef.current = null;
    preparedSwapRef.current = null;
    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      text: "Cancelled. No transaction was sent.",
      ts: Date.now(),
    });
  }

  async function handleConfirmSend() {
    const prepared = preparedTxRef.current;
    const intent = pendingSend;
    if (!prepared || !intent || !publicKey) return;

    setPreviewStatus("signing");
    setOrbStatus("processing");

    let signature: string;
    try {
      signature = await sendTransaction(prepared.transaction, connection);
      setPreviewStatus("confirming");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction rejected.";
      setPreviewError(msg);
      setPreviewStatus("error");
      setOrbStatus("error");
      scheduleOrbReset();
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
        throw new Error(
          typeof result.value.err === "string"
            ? result.value.err
            : "Transaction failed on chain."
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed.";
      setPreviewError(msg);
      setPreviewStatus("error");
      setOrbStatus("error");
      scheduleOrbReset();
      return;
    }

    setPendingSend(null);
    preparedTxRef.current = null;
    setOrbStatus("confirmed");
    scheduleOrbReset();

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
  }

  async function handleConfirmSwap() {
    const prepared = preparedSwapRef.current;
    if (!prepared || !pendingSwap || !publicKey) return;

    setSwapPreviewStatus("signing");
    setOrbStatus("processing");

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
      setSwapPreviewError(msg);
      setSwapPreviewStatus("error");
      setOrbStatus("error");
      scheduleOrbReset();
      return;
    }

    let signature: string;
    try {
      signature = await sendTransaction(transaction, connection);
      setSwapPreviewStatus("confirming");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Swap rejected.";
      setSwapPreviewError(msg);
      setSwapPreviewStatus("error");
      setOrbStatus("error");
      scheduleOrbReset();
      return;
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
      setSwapPreviewError(msg);
      setSwapPreviewStatus("error");
      setOrbStatus("error");
      scheduleOrbReset();
      return;
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
    setOrbStatus("confirmed");
    scheduleOrbReset();

    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      component: "receipt",
      receipt,
      ts: Date.now(),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 px-1 py-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {busy && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && !busy && (
        <div className="flex flex-wrap gap-2 py-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-xs text-white/50 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-white/80"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="relative flex-shrink-0 pt-2">
        <div className="relative flex items-end gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur">
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
            disabled={!connected || busy}
            className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-white/25 outline-none py-1.5 px-2 min-h-[36px] max-h-[120px] disabled:opacity-40"
          />
          <ShimmerButton
            onClick={() => send(input)}
            disabled={!input.trim() || busy || !connected}
            shimmerColor="#a5b4fc"
            background="rgba(99, 102, 241, 0.15)"
            borderRadius="12px"
            className="shrink-0 h-9 w-9 p-0 border-indigo-500/20 disabled:opacity-30"
          >
            <SendIcon />
          </ShimmerButton>
          <BorderBeam
            size={80}
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

      {pendingSend ? (
        <TransactionPreview
          intent={pendingSend}
          status={previewStatus}
          errorMessage={previewError}
          feeLamports={previewFeeLamports}
          recipientPubkey={previewRecipientPubkey}
          onConfirm={handleConfirmSend}
          onCancel={handleCancelPreview}
        />
      ) : pendingSwap ? (
        <TransactionPreview
          intent={pendingSwap}
          status={swapPreviewStatus}
          errorMessage={swapPreviewError}
          quote={swapQuoteDisplay}
          onConfirm={handleConfirmSwap}
          onCancel={handleCancelPreview}
        />
      ) : null}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          isUser
            ? "bg-indigo-500/20 text-indigo-300"
            : "bg-white/8 text-white/60"
        )}
      >
        {isUser ? "U" : "AI"}
      </div>
      {message.component === "portfolio" ? (
        <div className="max-w-[80%] flex-1">
          <PortfolioCard />
        </div>
      ) : message.component === "receipt" && message.receipt ? (
        <div className="max-w-[80%] flex-1">
          <ReceiptCard {...message.receipt} />
        </div>
      ) : (
        <div
          className={cn(
            "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
            isUser
              ? "rounded-tr-sm bg-indigo-600/20 text-white/90 border border-indigo-500/20"
              : "rounded-tl-sm bg-white/5 text-white/75 border border-white/8"
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
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-xs font-bold text-white/60">
        AI
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-white/8 bg-white/5 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-indigo-400/60 animate-bounce"
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
        text: `Fetching your last ${intent.limit ?? 5} transactions…`,
      };
    case "unknown":
      return { ...base, text: intent.clarification };
  }
}
