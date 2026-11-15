"use client";

import { useState } from "react";
import { LostSignalApi, type MatchNotification, type ActivityNotification, type Report } from "@/lib/frontend-api";

import { useInbox } from "./inbox-state";

const api = new LostSignalApi();

type Alert =
  | { type: "match"; item: MatchNotification; id: string; created_at: string; read_at: string | null }
  | { type: "activity"; item: ActivityNotification; id: string; created_at: string; read_at: string | null };

function AlertIcon({ kind }: { kind: "match" | ActivityNotification["kind"] }) {
  const paths = {
    match: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
    message: "M4 4h16v12H9l-5 4Z",
    claim: "M8 4h8v4h4v13H4V8h4Zm0 8h8m-8 4h5",
    approved: "m5 12 4 4L19 6",
    rejected: "m6 6 12 12M6 18 18 6",
    handoff: "m3 12 5 5 13-13M3 20h18",
  };
  return <svg className="notification-event-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

export function NotificationBell({ onOpen, onOpenMessage }: {
  onOpen: (report: Report, claimId?: string) => void;
  onOpenMessage: (claimId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { matches, activities, summaries, error: feedError, messageError, loading, refresh: load, markAlertRead } = useInbox();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const messageAlerts: ActivityNotification[] = summaries.filter(row => row.unread_count > 0).map(row => ({
    id: row.claim_id, kind: "message", claim_id: row.claim_id, report_id: row.report_id,
    report_title: row.report_title, created_at: row.created_at, read_at: null,
  }));

  const alerts: Alert[] = [
    ...matches.map(item => ({ type: "match" as const, id: `match:${item.id}`, item, created_at: item.created_at, read_at: item.read_at })),
    ...[...activities.filter(row => row.kind !== "message"), ...messageAlerts].map(item => ({ type: "activity" as const, id: `activity:${item.id}`, item, created_at: item.created_at, read_at: item.read_at })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  async function markRead(alert: Alert) {
    if (alert.read_at || (alert.type === "activity" && alert.item.kind === "message")) return;
    await markAlertRead(alert.type, alert.item.id);
  }

  async function view(alert: Alert) {
    if (busyId) return;
    setBusyId(alert.id);
    try {
      if (alert.type === "match") {
        const report = await api.report(alert.item.found_report_id);
        if (report.status !== "open") {
          await load(false);
          throw new Error("This found item is no longer open.");
        }
        await markRead(alert);
        onOpen(report);
      } else if (alert.item.kind !== "message") {
        // Open the found report's claim-review section for the finder.
        const report = await api.report(alert.item.report_id);
        await markRead(alert);
        onOpen(report, alert.item.claim_id);
      } else {
        await markRead(alert);
        onOpenMessage(alert.item.claim_id);
      }
      setError(""); setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open this notification.");
    } finally {
      setBusyId(null);
    }
  }

  async function markOnly(alert: Alert) {
    if (busyId) return;
    setBusyId(alert.id);
    try { await markRead(alert); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to mark notification read."); }
    finally { setBusyId(null); }
  }

  const unread = alerts.filter(alert => !alert.read_at).length;
  return <div className="notification-anchor">
    <button type="button" className="notification-trigger" aria-label={loading ? "Loading notifications" : feedError || messageError ? "Notifications, unread count unavailable" : `Notifications, ${unread} unread`}
      aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void load(false); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>
      </svg>
      {(feedError || messageError || loading) ? <span className="notification-badge">{loading ? "..." : "!"}</span> : unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="notification-panel" role="region" aria-label="Notifications">
      <div className="notification-panel-head"><h2>Notifications</h2>
        <button type="button" className="text-action" onClick={() => setOpen(false)}>Close</button></div>
      <p className="field-hint">Claims, handoffs, messages and possible matches.</p>
      {(error || feedError || messageError) && <p className="alert alert-error" role="alert">{error || feedError || messageError} <button type="button" className="text-action" onClick={() => void load(true)}>Retry</button></p>}
      {loading && <p role="status">Loading notifications...</p>}
      {!alerts.length && !loading && !error && !feedError && !messageError && <div className="notification-empty">No notifications yet.</div>}
      <div className="notification-list">
        {alerts.map(alert => <article className={alert.read_at ? "notification-item" : "notification-item unread"} key={alert.id}>
          <AlertIcon kind={alert.type === "match" ? "match" : alert.item.kind} />
          {alert.type === "match" ? <>
            <b>Possible match found</b>
            <p>{alert.item.found_report.title} was reported at {alert.item.found_report.location}.</p>
          </> : alert.item.kind === "claim" ? <>
            <b>New ownership request</b>
            <p>Someone submitted an ownership claim for {alert.item.report_title}.</p>
          </> : alert.item.kind === "approved" ? <>
            <b>Claim approved</b><p>Your claim for {alert.item.report_title} was approved! Message the finder to arrange pickup.</p>
          </> : alert.item.kind === "rejected" ? <>
            <b>Claim not approved</b><p>Your claim for {alert.item.report_title} was not approved.</p>
          </> : alert.item.kind === "handoff" ? <>
            <b>Handoff complete</b><p>The claimant confirmed receiving {alert.item.report_title}.</p>
          </> : <>
            <b>New messages</b>
            <p>{summaries.find(row => row.claim_id === alert.item.claim_id)?.unread_count} unread messages about {alert.item.report_title}.</p>
          </>}
          <time dateTime={alert.created_at}>{new Date(alert.created_at).toLocaleString()}</time>
          <div className="notification-actions">
            <button type="button" className="text-action" disabled={!!busyId}
              onClick={() => void view(alert)}>{alert.type === "match" ? "View found report" : alert.item.kind === "message" ? "Open conversation" : "View claim"} →</button>
            {!alert.read_at && !(alert.type === "activity" && alert.item.kind === "message") && <button type="button" className="text-action" disabled={!!busyId}
              onClick={() => void markOnly(alert)}>Mark read</button>}
          </div>
        </article>)}
      </div>
    </div>}
  </div>;
}
