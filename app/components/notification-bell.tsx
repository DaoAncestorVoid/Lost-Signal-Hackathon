"use client";

import { useEffect, useState } from "react";
import { LostSignalApi, type MatchNotification, type Report } from "@/lib/frontend-api";

const api = new LostSignalApi();
export function NotificationBell({ onOpen }: { onOpen: (report: Report) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MatchNotification[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(refresh: boolean) {
    try {
      if (refresh) await api.refreshNotifications();
      setItems(await api.notifications()); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load notifications."); }
  }
  useEffect(() => {
    const timer = setTimeout(() => { void load(true); }, 0);
    const interval = setInterval(() => { if (!document.hidden) void load(true); }, 120_000);
    const onFocus = () => { void load(true); };
    window.addEventListener("focus", onFocus);
    return () => { clearTimeout(timer); clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, []);
  async function markRead(item: MatchNotification) {
    if (item.read_at || busy) return;
    setBusy(true);
    try { await api.markNotificationRead(item.id); setItems(previous => previous.map(row => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to mark notification read."); }
    finally { setBusy(false); }
  }
  async function view(item: MatchNotification) {
    if (busy) return;
    setBusy(true);
    try {
      const report = await api.report(item.found_report_id);
      if (report.status !== "open") { await load(false); throw new Error("This report is no longer open."); }
      if (!item.read_at) {
        await api.markNotificationRead(item.id);
        setItems(previous => previous.map(row => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
      }
      setError(""); onOpen(report); setOpen(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to open this report."); }
    finally { setBusy(false); }
  }
  const unread = items.filter(item => !item.read_at).length;
  return <div className="notification-anchor"><button type="button" className="notification-trigger" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void load(false); }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>{unread > 0 && <span className="notification-badge">{unread > 9 ? "9+" : unread}</span>}
  </button>{open && <div className="notification-panel" role="region" aria-label="Match notifications"><div className="notification-panel-head"><h2>Potential matches</h2><button type="button" className="text-action" onClick={() => setOpen(false)}>Close</button></div>
    <p className="field-hint">These are possible matches, not proof of ownership.</p>
    {error && <p className="alert alert-error" role="alert">{error} <button type="button" className="text-action" onClick={() => void load(true)}>Retry</button></p>}
    {!items.length && !error && <div className="notification-empty">No potential matches yet. We’ll check again while you’re here.</div>}
    <div className="notification-list">{items.map(item => <article className={item.read_at ? "notification-item" : "notification-item unread"} key={item.id}><b>Possible match found</b><p>{item.found_report.title} was reported at {item.found_report.location}.</p><time dateTime={item.found_report.created_at}>{new Date(item.found_report.created_at).toLocaleString()}</time><div className="notification-actions"><button type="button" className="text-action" disabled={busy} onClick={() => void view(item)}>View found report →</button>{!item.read_at && <button type="button" className="text-action" disabled={busy} onClick={() => void markRead(item)}>Mark read</button>}</div></article>)}</div>
  </div>}</div>;
}
