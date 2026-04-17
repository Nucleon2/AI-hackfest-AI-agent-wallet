"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

type Role = "user" | "ai";

interface Message {
  id: string;
  role: Role;
  text: string;
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

export function ChatInterface() {
  const { connected } = useWallet();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      const res = await fetch("/api/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "ai",
        text: data.success
          ? formatIntent(data.data)
          : (data.error ?? "Something went wrong."),
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: "Couldn't reach the AI. Check your API key in .env.local.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
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

function formatIntent(intent: Record<string, unknown>): string {
  const action = intent.action as string;
  switch (action) {
    case "balance":
      return `Fetching your ${intent.token ? (intent.token as string) : "wallet"} balance…`;
    case "send":
      return `Got it! Preparing to send ${intent.amount} ${intent.token} to ${intent.recipient}.`;
    case "swap":
      return `Preparing a swap: ${intent.amount} ${intent.fromToken} → ${intent.toToken}.`;
    case "history":
      return `Fetching your last ${intent.limit ?? 5} transactions…`;
    case "unknown":
      return (intent.clarification as string) ?? "I didn't understand that.";
    default:
      return JSON.stringify(intent, null, 2);
  }
}
