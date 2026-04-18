"use client";

import { useEffect, useState, useCallback } from "react";
import { BorderBeam } from "@/components/ui/border-beam";
import { shortAddress } from "@/lib/transactionBuilder";
import type { Contact } from "@/types/contact";

interface Props {
  walletPubkey: string | null;
}

export function ContactsCard({ walletPubkey }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContacts = useCallback(async () => {
    if (!walletPubkey) {
      setContacts([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/contacts?wallet=${walletPubkey}`);
      const json = (await res.json()) as
        | { success: true; data: Contact[] }
        | { success: false; error?: string };
      if (json.success) setContacts(json.data);
    } finally {
      setLoading(false);
    }
  }, [walletPubkey]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  async function handleDelete(name: string) {
    if (!walletPubkey) return;
    await fetch(
      `/api/contacts/${encodeURIComponent(name)}?wallet=${walletPubkey}`,
      { method: "DELETE" }
    );
    fetchContacts();
  }

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-sm">
      <BorderBeam size={80} duration={8} colorFrom="#6366f1" colorTo="#a78bfa" borderWidth={1} />
      <div className="mb-3 text-[11px] uppercase tracking-widest text-white/40">
        Address Book
      </div>
      {contacts.length === 0 ? (
        <div className="py-4 text-center text-sm text-white/30">
          No contacts saved yet. Try &ldquo;save [address] as Alice&rdquo;.
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-sm font-medium text-white">{c.name}</div>
                <div className="font-mono text-[11px] text-white/40">
                  {shortAddress(c.address, 6, 6)}
                </div>
              </div>
              <button
                onClick={() => handleDelete(c.name)}
                className="shrink-0 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 transition-colors hover:bg-rose-500/20"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
