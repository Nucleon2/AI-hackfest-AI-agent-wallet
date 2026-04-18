"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";
import { PortfolioCard } from "@/components/PortfolioCard";
import { ReceiptCard } from "@/components/ReceiptCard";
import { TransactionHistoryCard } from "@/components/TransactionHistoryCard";
import { ScheduledPaymentsCard } from "@/components/ScheduledPaymentsCard";
import { ContactsCard } from "@/components/ContactsCard";
import { AutoApproveToggle } from "@/components/AutoApproveToggle";
import { useAutoApprove } from "@/hooks/useAutoApprove";
import {
  TransactionPreview,
  type PreviewStatus,
  type SwapQuoteDisplay,
} from "@/components/TransactionPreview";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { useScheduledPayments } from "@/hooks/useScheduledPayments";
import {
  buildSolTransferTx,
  deserializeSwapTx,
  shortAddress,
  validateRecipient,
} from "@/lib/transactionBuilder";
import { SOLANA_NETWORK, type SolanaNetwork } from "@/lib/solanaClient";
import type { JupiterQuote } from "@/lib/jupiterClient";
import type { Intent, SendIntent, SwapIntent, SaveContactIntent, ListContactsIntent, DeleteContactIntent } from "@/types/intent";
import type { ScheduledPayment } from "@/types/schedule";
import { cn } from "@/lib/utils";

type Role = "user" | "ai";
type MessageComponent = "portfolio" | "receipt" | "history" | "schedules" | "contacts";

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
  historyLimit?: number;
  ts: number;
}

const WELCOME: Message = {
  id: "welcome",
  role: "ai",
  text: "Hey! I'm your AI wallet assistant. Connect a Phantom wallet and try:\n\u2022 \"What's my balance?\"\n\u2022 \"Swap 10 USDC for SOL\"\n\u2022 \"Send 0.1 SOL to Alice\" — save contacts first!\n\u2022 \"Save [address] as Alice\"",
  ts: Date.now(),
};

const SUGGESTIONS = [
  "What's my balance?",
  "Swap 10 USDC for SOL",
  "Show my contacts",
  "Send 0.1 SOL to alice.sol",
  "Show my last 5 transactions",
  "Send 5 SOL every Friday",
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

  const [pendingScheduledExec, setPendingScheduledExec] =
    useState<ScheduledPayment | null>(null);
  const [scheduleExecStatus, setScheduleExecStatus] =
    useState<PreviewStatus>("building");
  const [scheduleExecError, setScheduleExecError] = useState<string | null>(
    null
  );
  const [scheduleExecFee, setScheduleExecFee] = useState<number | null>(null);
  const preparedScheduleRef = useRef<PreparedTx | null>(null);

  const { schedules, duePayment, loading: schedulesLoading, refresh: refreshSchedules, clearDue } =
    useScheduledPayments(publicKey?.toBase58() ?? null);

  const { autoApprove, toggle: toggleAutoApprove } = useAutoApprove();

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

  // Auto-approve: fire confirm handlers as soon as preflight reaches "ready"
  useEffect(() => {
    if (autoApprove && previewStatus === "ready" && pendingSend) {
      handleConfirmSend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApprove, previewStatus, pendingSend]);

  useEffect(() => {
    if (autoApprove && swapPreviewStatus === "ready" && pendingSwap) {
      handleConfirmSwap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApprove, swapPreviewStatus, pendingSwap]);

  useEffect(() => {
    if (autoApprove && scheduleExecStatus === "ready" && pendingScheduledExec) {
      handleConfirmScheduledExec();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApprove, scheduleExecStatus, pendingScheduledExec]);

  function appendMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
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

    let signature: string;
    try {
      signature = await sendTransaction(prepared.transaction, connection);
      setPreviewStatus("confirming");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction rejected.";
      setPreviewError(msg);
      setPreviewStatus("error");
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
      return;
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
  }

  async function handleConfirmSwap() {
    const prepared = preparedSwapRef.current;
    if (!prepared || !pendingSwap || !publicKey) return;

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
      setSwapPreviewError(msg);
      setSwapPreviewStatus("error");
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

    appendMessage({
      id: crypto.randomUUID(),
      role: "ai",
      component: "receipt",
      receipt,
      ts: Date.now(),
    });
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
            className="flex-1 resize-none bg-transparent text-sm text-white/90 placeholder:text-white/25 outline-none py-1.5 px-2 min-h-[36px] max-h-[120px] disabled:opacity-40"
          />
          <ShimmerButton
            onClick={() => send(input)}
            disabled={!input.trim() || busy || !connected}
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
}: {
  message: Message;
  scheduledPayments: ScheduledPayment[];
  schedulesLoading: boolean;
  onCancelSchedule: (id: string) => void;
  walletPubkey: string | null;
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
  }
}
