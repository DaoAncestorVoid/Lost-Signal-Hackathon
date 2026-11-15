"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LostSignalApi, type ActivityNotification, type MatchNotification } from "@/lib/frontend-api";

const api = new LostSignalApi();
const SummarySchema = z.object({
  claim_id: z.string().uuid(), report_id: z.string().uuid(), report_title: z.string(),
  latest_message_id: z.string().uuid().nullable(), body: z.string().nullable(),
  created_at: z.string(), unread_count: z.number().int().nonnegative(),
});
export type ConversationSummary = z.infer<typeof SummarySchema>;
type Inbox = {
  summaries: ConversationSummary[]; matches: MatchNotification[]; activities: ActivityNotification[];
  error: string; messageError: string; loading: boolean; unread: number | null;
  refresh: (matches?: boolean) => Promise<void>;
  readConversation: (claimId: string, messageId: string) => Promise<void>;
  markAlertRead: (type: "match" | "activity", id: string) => Promise<void>;
};
const InboxContext = createContext<Inbox | null>(null);
export function useInbox() {
  const inbox = useContext(InboxContext);
  if (!inbox) throw new Error("InboxProvider required");
  return inbox;
}

export function InboxProvider({ client, enabled, children }: {
  client: SupabaseClient | null; enabled: boolean; children: React.ReactNode;
}) {
  const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
  const [matches, setMatches] = useState<MatchNotification[]>([]);
  const [activities, setActivities] = useState<ActivityNotification[]>([]);
  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const running = useRef<Promise<void> | null>(null);
  const matching = useRef(false);
  const refresh = useCallback(async (refreshMatches = false): Promise<void> => {
    if (!client || !enabled) return;
    if (refreshMatches && !matching.current) {
      matching.current = true;
      const matchVersion = generation.current;
      // Deterministic matching must never delay incoming-message counts.
      void api.refreshNotifications().then(() => api.notifications()).then(rows => {
        if (matchVersion === generation.current) setMatches(rows);
      }).catch(caught => {
        if (matchVersion === generation.current) setError(caught instanceof Error ? caught.message : "Unable to refresh potential matches.");
      }).finally(() => { matching.current = false; });
    }
    if (running.current) return running.current;
    const version = generation.current;
    const work = async () => {
      const results = await Promise.allSettled([
        (async () => {
          const result = await client.rpc("conversation_summaries");
          if (result.error) throw new Error(["PGRST202", "PGRST205", "42P01"].includes(result.error.code)
            ? "Messaging read-state migration is required. Ask the project maintainer to apply the pending migrations."
            : "Unable to load unread messages. Please retry.");
          return z.array(SummarySchema).parse(result.data);
        })(),
        (async () => {
          const rows = await api.notifications();
          return { rows };
        })(),
        api.activityNotifications(),
      ]);
      if (version !== generation.current) return;
      const [summary, match, activity] = results;
      if (summary.status === "fulfilled") { setSummaries(summary.value); setMessageError(""); }
      else setMessageError(summary.reason instanceof Error ? summary.reason.message : "Unable to load unread messages.");
      const issues: string[] = [];
      if (match.status === "fulfilled") {
        setMatches(match.value.rows);
      } else issues.push(String(match.reason));
      if (activity.status === "fulfilled") setActivities(activity.value);
      else issues.push(String(activity.reason));
      setError(issues.join(" "));
      setLoading(false);
    };
    running.current = work().finally(() => { running.current = null; });
    return running.current;
  }, [client, enabled]);

  const readConversation = useCallback(async (claimId: string, messageId: string) => {
    if (!client || !enabled) return;
    const result = await client.rpc("mark_conversation_read", { p_claim_id: claimId, p_message_id: messageId });
    if (result.error) throw new Error("Messages loaded, but unable to save read status. Please retry.");
    // Invalidate older snapshots; a slow bell request must not delay read badges.
    generation.current++;
    const version = generation.current;
    const summary = await client.rpc("conversation_summaries");
    if (version !== generation.current) return;
    const parsed = z.array(SummarySchema).safeParse(summary.data);
    if (summary.error || !parsed.success) {
      setMessageError("Read status saved, but unable to refresh unread counts. Please retry.");
      return;
    }
    setSummaries(parsed.data); setMessageError(""); setLoading(false);
  }, [client, enabled]);

  const markAlertRead = useCallback(async (type: "match" | "activity", id: string) => {
    if (type === "match") await api.markNotificationRead(id);
    else await api.markActivityNotificationRead(id);
    generation.current++;
    const read_at = new Date().toISOString();
    if (type === "match") setMatches(previous => previous.map(row => row.id === id ? { ...row, read_at } : row));
    else setActivities(previous => previous.map(row => row.id === id ? { ...row, read_at } : row));
  }, []);

  useEffect(() => {
    const start = setTimeout(() => { void refresh(true); }, 0);
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 12_000);
    const matchTimer = setInterval(() => { if (!document.hidden) void refresh(true); }, 120_000);
    const focus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      // This is a request sequence, not a DOM ref; invalidate outstanding reads.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      clearTimeout(start); clearInterval(timer); clearInterval(matchTimer);
      window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  return <InboxContext.Provider value={{ summaries, matches, activities, error, messageError, loading,
    unread: loading || messageError ? null : summaries.reduce((sum, row) => sum + row.unread_count, 0),
    refresh, readConversation, markAlertRead }}>{children}</InboxContext.Provider>;
}

export function MessagesBadge() {
  const { unread, messageError } = useInbox();
  if (unread === null) return <span className="inbox-badge" role="status" aria-label={messageError ? "Unread message count unavailable" : "Loading unread messages"}>{messageError ? "!" : "…"}</span>;
  return unread > 0 ? <span className="inbox-badge" aria-label={`${unread} unread incoming messages`}>{unread > 9 ? "9+" : unread}</span> : null;
}
