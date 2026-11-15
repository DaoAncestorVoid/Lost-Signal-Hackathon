"use client";

import { useEffect, useState } from "react";
import { LostSignalApi, type MatchNotification, type ActivityNotification, type Report } from "@/lib/frontend-api";

const api = new LostSignalApi();

type Alert =
  | { type: "match"; item: MatchNotification; id: string; created_at: string; read_at: string | null }
  | { type: "activity"; item: ActivityNotification; id: string; created_at: string; read_at: string | null };

export function NotificationBell({ onOpen, onOpenMessage }: {
  onOpen: (report: Report) => void;
  onOpenMessage: (claimId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<MatchNotification[]>([]);
  const [activities, setActivities] = useState<ActivityNotification[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(refreshMatches: boolean) {
    try {
      if (refreshMatches) await api.refreshNotifications();
      const [newMatches, newActivities] = await Promise.all([api.notifications(), api.activityNotifications()]);
      setMatches(newMatches);
      setActivities(newActivities);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load notifications.");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(true); }, 0);
    // Claim and message alerts are inserted by DB triggers. Refresh while active.
    const interval = setInterval(() => { if (!document.hidden) void load(false); }, 15_000);
    const matchInterval = setInterval(() => { if (!document.hidden) void load(true); }, 120_000);
    const onFocus = () => { void load(true); };
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer); clearInterval(interval); clearInterval(matchInterval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const alerts: Alert[] = [
    ...matches.map(item => ({ type: "match" as const, id: `match:${item.id}`, item, created_at: item.created_at, read_at: item.read_at })),
    ...activities.map(item => ({ type: "activity" as const, id: `activity:${item.id}`, item, created_at: item.created_at, read_at: item.read_at })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  async function markRead(alert: Alert) {
    if (alert.read_at) return;
    if (alert.type === "match") {
      await api.markNotificationRead(alert.item.id);
      setMatches(previous => previous.map(row =>
        row.id === alert.item.id ? { ...row, read_at: new Date().toISOString() } : row));
    } else {
      await api.markActivityNotificationRead(alert.item.id);
      setActivities(previous => previous.map(row =>
        row.id === alert.item.id ? { ...row, read_at: new Date().toISOString() } : row));
    }
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
      } else if (alert.item.kind === "claim") {
        // Open the found report's claim-review section for the finder.
        const report = await api.report(alert.item.report_id);
        await markRead(alert);
        onOpen(report);
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
    <button type="button" className="notification-trigger" aria-label={`Notifications, ${unread} unread`}
      aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void load(false); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>
      </svg>
      {unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="notification-panel" role="region" aria-label="Notifications">
      <div className="notification-panel-head"><h2>Notifications</h2>
        <button type="button" className="text-action" onClick={() => setOpen(false)}>Close</button></div>
      <p className="field-hint">New claims, messages and possible matches.</p>
      {error && <p className="alert alert-error" role="alert">{error} <button type="button" className="text-action" onClick={() => void load(true)}>Retry</button></p>}
      {!alerts.length && !error && <div className="notification-empty">No notifications yet.</div>}
      <div className="notification-list">
        {alerts.map(alert => <article className={alert.read_at ? "notification-item" : "notification-item unread"} key={alert.id}>
          {alert.type === "match" ? <>
            <b>Possible match found</b>
            <p>{alert.item.found_report.title} was reported at {alert.item.found_report.location}.</p>
          </> : alert.item.kind === "claim" ? <>
            <b>New ownership claim</b>
            <p>Someone submitted a claim for {alert.item.report_title}.</p>
          </> : <>
            <b>New message</b>
            <p>You have a new message about {alert.item.report_title}.</p>
          </>}
          <time dateTime={alert.created_at}>{new Date(alert.created_at).toLocaleString()}</time>
          <div className="notification-actions">
            <button type="button" className="text-action" disabled={!!busyId}
              onClick={() => void view(alert)}>{alert.type === "match" ? "View found report" : alert.item.kind === "claim" ? "Review claim" : "Open conversation"} →</button>
            {!alert.read_at && <button type="button" className="text-action" disabled={!!busyId}
              onClick={() => void markOnly(alert)}>Mark read</button>}
          </div>
        </article>)}
      </div>
    </div>}
  </div>;
}
