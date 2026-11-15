"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Claim, Report } from "@/lib/frontend-api";
import { canMessageOnClaim, normalizeMessageBody, type ChatMessage } from "@/lib/messages";

import { useInbox } from "./inbox-state";

const MAX_DISPLAY_MESSAGES = 100;

type Props = {
  client: SupabaseClient;
  userId: string;
  claims: Claim[];
  reports: Report[];
  initialClaimId?: string | null;
  onOpenReport: (report: Report) => void;
};


export function MessagesView({ client, userId, claims, reports, initialClaimId, onOpenReport }: Props) {
  const { summaries, messageError, loading: inboxLoading, refresh: refreshInbox, readConversation } = useInbox();
  const previews = useMemo(() => Object.fromEntries(summaries.map(row => [row.claim_id, row])), [summaries]);
  const conversations = useMemo(() => claims.flatMap(claim => {
    const report = reports.find(row => row.id === claim.report_id);
    return canMessageOnClaim(claim, report, userId) && report ? [{ claim, report }] : [];
  }).sort((a, b) => (previews[b.claim.id]?.created_at ?? b.claim.created_at).localeCompare(previews[a.claim.id]?.created_at ?? a.claim.created_at)), [claims, reports, userId, previews]);

  const [selectedId, setSelectedId] = useState<string | null>(initialClaimId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);
  const activeThread = useRef<string | null>(null);
  const acknowledged = useRef<Record<string, string>>({});


  // Derive the default conversation without synchronously setting state in an effect.
  const activeSelectedId =
    selectedId && conversations.some(row => row.claim.id === selectedId) ? selectedId
    : initialClaimId && conversations.some(row => row.claim.id === initialClaimId) ? initialClaimId
    : null;
  const selected = conversations.find(row => row.claim.id === activeSelectedId) ?? null;

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages, activeSelectedId]);

  const loadMessages = useCallback(async (signal?: AbortSignal) => {
    if (!activeSelectedId) return;
    const { data, error: loadError } = await client.from("messages")
      .select("id,claim_id,sender_id,body,created_at")
      .eq("claim_id", activeSelectedId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MAX_DISPLAY_MESSAGES);
    if (signal?.aborted || activeThread.current !== activeSelectedId) return;
    if (loadError) throw new Error("Unable to load conversation.");
    const newest = data?.[0];
    setMessages([...(data ?? []) as ChatMessage[]].reverse());
    if (newest && acknowledged.current[activeSelectedId] !== newest.id && !document.hidden && !signal?.aborted) {
      await readConversation(activeSelectedId, newest.id);
      acknowledged.current[activeSelectedId] = newest.id;
    }
  }, [client, activeSelectedId, readConversation]);

  useEffect(() => {
    if (!activeSelectedId) return;
    activeThread.current = activeSelectedId;
    const abort = new AbortController();
    const refresh = async () => {
      try { await loadMessages(abort.signal); if (!abort.signal.aborted) setError(""); }
      catch (caught) { if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load messages. Try again shortly."); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    };
    const start = setTimeout(() => { setLoading(true); void refresh(); }, 0);
    // Poll only while this conversation is open. Realtime can be added later.
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 12_000);
    const onFocus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { activeThread.current = null; abort.abort(); clearTimeout(start); clearInterval(interval); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [activeSelectedId, loadMessages]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = normalizeMessageBody(draft);
    if (!body || !selected || sending) return;
    setSending(true); setError("");
    try {
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user || user.id !== userId || user.is_anonymous !== false) {
        throw new Error("Please sign in with a permanent account.");
      }
      const { error: sendError } = await client.from("messages")
        .insert({ claim_id: selected.claim.id, sender_id: user.id, body });
      if (sendError) throw new Error("Unable to send this message. The claim may no longer be open for messaging.");
      setDraft("");
      await loadMessages();
      await refreshInbox();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to send the message."); }
    finally { setSending(false); }
  }

  function selectConversation(id: string) {
    activeThread.current = null;
    setSelectedId(id); setMessages([]); setError(""); setDraft("");
  }

  return <section className="messages-page" aria-labelledby="messages-title">
    <div className="page-heading">
      <span className="eyebrow">Community conversations</span>
      <h1 id="messages-title">Messages</h1>
      <p>Coordinate the return of a found item. Conversations open after an ownership claim is submitted.</p>
    </div>
    {messageError && <p className="err" role="alert">{messageError} <button className="text-action" onClick={() => void refreshInbox()}>Retry</button></p>}
    {inboxLoading && <p role="status">Loading unread messages...</p>}
    {conversations.length === 0 ? <div className="state-card">
      <b>No conversations yet</b>
      <p>Submit an ownership claim on a found item, or wait for someone to claim a found item you posted. Messages will appear here.</p>
    </div> : <div className="messages-layout">
      <aside className="messages-list" aria-label="Conversations">
        <h2>Conversations <span>({conversations.length})</span></h2>
        {conversations.map(({ claim, report }) => <button type="button" key={claim.id}
          onClick={() => selectConversation(claim.id)}
          className={"messages-conversation" + (activeSelectedId === claim.id ? " is-selected" : "") + ((previews[claim.id]?.unread_count ?? 0) > 0 ? " is-unread" : "")}
          aria-current={activeSelectedId === claim.id ? "true" : undefined}>
          <b>{report.title} {(previews[claim.id]?.unread_count ?? 0) > 0 && <span className="inbox-badge" aria-label={`${previews[claim.id].unread_count} unread messages`}>{previews[claim.id].unread_count > 9 ? "9+" : previews[claim.id].unread_count}</span>}</b>
          <span>{claim.claimant_id === userId ? "With the finder" : "With a claimant"} · {claim.status}</span>
          {previews[claim.id]?.body && <span className="messages-preview">{previews[claim.id].body!.length > 70 ? previews[claim.id].body!.slice(0, 70) + "…" : previews[claim.id].body}</span>}
          {previews[claim.id] && <time className="messages-preview-time" dateTime={previews[claim.id].created_at}>{new Date(previews[claim.id].created_at).toLocaleString()}</time>}
        </button>)}
      </aside>
      <div className="messages-chat">
        {selected ? <>
          <div className="messages-chat-header">
            <div><span className="eyebrow">Regarding a found item</span><h2>{selected.report.title}</h2></div>
            <button type="button" className="button button-secondary" onClick={() => onOpenReport(selected.report)}>View item</button>
          </div>
          <div className="messages-thread" role="log" aria-label="Messages" aria-live="polite">
            {loading && <p className="note" role="status">Loading messages…</p>}
            {!loading && messages.length === 0 && !error && <p className="empty">No messages yet. Say hello and arrange a safe meeting place.</p>}
            {messages.map(message => <div key={message.id}
              className={"messages-bubble" + (message.sender_id === userId ? " mine" : "")}>
              <span className="messages-author">{message.sender_id === userId ? "You" : "Other participant"}</span>
              <p>{message.body}</p>
              <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
            </div>)}
            <div ref={threadEnd} aria-hidden="true" />
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          <form className="messages-compose" onSubmit={send}>
            <label htmlFor="message-text" className="sr-only">Message</label>
            <input id="message-text" value={draft} onChange={e => setDraft(e.target.value)}
              maxLength={2000} placeholder="Write a message…" autoComplete="off" />
            <button className="button button-primary" disabled={sending || !normalizeMessageBody(draft)}>
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
          <p className="note">Meet in public places. Do not share passwords or sensitive personal information.</p>
        </> : <div className="messages-empty">Choose a conversation to start messaging.</div>}
      </div>
    </div>}
  </section>;
}
