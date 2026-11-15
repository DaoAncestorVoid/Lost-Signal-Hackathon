"use client";

import { useEffect, useRef, useState } from "react";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { AuthForm, useAuth } from "./components/auth";
import { ReportPhoto } from "./components/report-photo";
import { BrowseView } from "./components/browse-view";
import { ReportForm } from "./components/report-form";
import { ReportEditor } from "./components/report-editor";
import { NotificationBell } from "./components/notification-bell";
import { MatchResultCard } from "./components/match-result-card";
import { KarmaPanel } from "./components/karma-panel";
import { ReturnJourney } from "./components/return-journey";
import { InboxProvider, MessagesBadge, useInbox } from "./components/inbox-state";
import { MessagesView } from "./components/messages-view";
import { BrandWordmark } from "./components/brand-wordmark";
import { LostSignalApi, browseCategories, browseReports, type Report, type Claim, type RankedReport, type ReportMatchAnalysis } from "@/lib/frontend-api";
import { validateNewClaim } from "@/lib/claims/validation";
import { deleteConfirmation } from "@/lib/reports/management";

type View = "browse" | "ai" | "post" | "mine" | "detail" | "edit" | "messages";
const api = new LostSignalApi();
const postCategories = ["Bags", "Keys", "IDs", "Tech", "Other"];
const errorMessage = (err: unknown) => err instanceof Error ? err.message : "The request failed. Please try again.";

export default function Home() {
  const auth = useAuth();
  const [dark, setDark] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [homeSignal, setHomeSignal] = useState(0);
  const [notificationReport, setNotificationReport] = useState<Report | null>(null);
  const [notificationClaim, setNotificationClaim] = useState<string | null>(null);
  const [notificationMessageClaim, setNotificationMessageClaim] = useState<string | null>(null);
  useEffect(() => {
    // Resolve theme after hydration; CSS supplies the system preference immediately.
    const sync = () => {
      let theme: string | null = null;
      try { theme = localStorage.getItem("theme"); } catch {}
      const next = theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
      setDark(next);
    };
    const timer = setTimeout(sync, 0);
    return () => clearTimeout(timer);
  }, []);
  function toggleTheme() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch {}
    setDark(!dark);
  }
  async function logout() {
    if (!auth.client || logoutBusy) return;
    setLogoutBusy(true); setLogoutError("");
    try {
      const { error } = await auth.client.auth.signOut();
      if (error) throw error;
    } catch (err) { setLogoutError(errorMessage(err)); }
    finally { setLogoutBusy(false); }
  }
  return <InboxProvider key={auth.user?.id ?? "signed-out"} client={auth.client} enabled={!!auth.user && auth.user.is_anonymous === false}>
    <header className="site-header"><div className="header-inner">
      <div className="brand"><button type="button" className="brand-btn" onClick={() => setHomeSignal(n => n + 1)} aria-label="LostSignal, go to Browse"><BrandWordmark /></button></div>
      <div className="header-tools">
        {auth.user && <span className="account-label" title={auth.user.email ?? "Guest session"}>{auth.user.is_anonymous ? "Guest session" : auth.user.email}</span>}
        {auth.user && !auth.user.is_anonymous && <NotificationBell onOpen={(report, claimId) => { setNotificationReport(report); setNotificationClaim(claimId ?? null); }} onOpenMessage={setNotificationMessageClaim} />}
        <button type="button" className="dark-toggle" onClick={toggleTheme} aria-pressed={dark}>Dark mode: {dark ? "on" : "off"}</button>
        {auth.user && <button className="button button-quiet signout" disabled={logoutBusy} onClick={logout}>{logoutBusy ? "Signing out…" : auth.user.is_anonymous ? "Sign in / Sign up" : "Sign out"}</button>}
      </div>
    </div></header>
    <main className="site-main">
      {auth.error && <p className="err" role="alert">{auth.error}</p>}
      {logoutError && <p className="err" role="alert">{logoutError}</p>}
      {auth.loading ? <div className="state-card" role="status"><span className="spinner" />Checking your session…</div> : auth.user && auth.client ? <>
        {auth.user.is_anonymous && <p className="guest-notice" role="status">Exploring as a guest. You can browse and try limited matching. Sign in to post an item or submit a claim.</p>}
        <Workspace key={auth.user.id} user={auth.user} client={auth.client} homeSignal={homeSignal} notificationClaim={notificationClaim} notificationReport={notificationReport} onNotificationConsumed={() => setNotificationReport(null)} notificationMessageClaim={notificationMessageClaim} onNotificationMessageConsumed={() => setNotificationMessageClaim(null)} />
      </> : <div className="auth-layout"><section className="auth-story"><span className="eyebrow">Made for the UMass community</span><h1>Good things find their way back.</h1><p>LostSignal connects people who lost something with the people who found it. Share a report, explore campus finds, and take the next step with confidence.</p><div className="auth-steps"><span>01 &nbsp; Report it</span><span>02 &nbsp; Find a match</span><span>03 &nbsp; Claim it</span></div></section><AuthForm client={auth.client} /></div>}
    </main>
  </InboxProvider>;
}

function Workspace({ user, client, homeSignal, notificationClaim, notificationReport, onNotificationConsumed, notificationMessageClaim, onNotificationMessageConsumed }: {
  user: User; client: SupabaseClient; homeSignal: number;
  notificationClaim: string | null; notificationReport: Report | null; onNotificationConsumed: () => void;
  notificationMessageClaim: string | null; onNotificationMessageConsumed: () => void;
}) {
  const { summaries: inboxSummaries, activities: inboxActivities } = useInbox();
  const inboxClaimRevision = inboxSummaries.map(row => row.claim_id).sort().join(",") + ":" + inboxActivities.map(row => row.id).sort().join(",");
  const [focusedClaim, setFocusedClaim] = useState<string | null>(null);
  const [view, setView] = useState<View>("browse");
  const [seenHomeSignal, setSeenHomeSignal] = useState(homeSignal);
  if (homeSignal !== seenHomeSignal) {
    setSeenHomeSignal(homeSignal);
    setView("browse");
    }
  const [browseMode, setBrowseMode] = useState<"list" | "map">("list");
  const guest = user.is_anonymous === true;
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsError, setClaimsError] = useState("");
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [handoffRefresh, setHandoffRefresh] = useState(0);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState("");
  const deepLinkHandled = useRef(false);
  const [selectedMessageClaim, setSelectedMessageClaim] = useState<string | null>(null);
  const [proof, setProof] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  const reportRequest = useRef(0);
  const claimRequest = useRef(0);
  const [aiText, setAiText] = useState("");
  const [searchAttributes, setSearchAttributes] = useState({ category: "", color: "", brand: "", itemDate: "" });
  const [aiResults, setAiResults] = useState<RankedReport[] | null>(null);
  const [aiError, setAiError] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [analysis, setAnalysis] = useState<ReportMatchAnalysis | null>(null);
  const [aiMode, setAiMode] = useState<"quick" | "report">("quick");
  const [reportType, setReportType] = useState<"lost" | "found">("found");
  const [formKey, setFormKey] = useState(0);
  const [completedReport, setCompletedReport] = useState<Report | null>(null);

  async function sessionRequired() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || data.user.id !== user.id) throw new Error("Your session has expired. Sign in again.");
  }
  async function loadReports(signal?: AbortSignal) {
    const sequence = ++reportRequest.current;
    setLoading(true); setLoadError("");
    try {
      const rows = await api.reports(signal);
      if (active.current && !signal?.aborted && sequence === reportRequest.current) setReports(rows);
    } catch (err) {
      if (active.current && !signal?.aborted && sequence === reportRequest.current) { setReports([]); setLoadError(errorMessage(err)); }
    } finally { if (active.current && !signal?.aborted && sequence === reportRequest.current) setLoading(false); }
  }
  async function loadClaims(signal?: AbortSignal) {
    const sequence = ++claimRequest.current;
    setClaimsLoading(true); setClaimsError("");
    try {
      const rows = await api.claims(signal);
      if (active.current && !signal?.aborted && sequence === claimRequest.current) setClaims(rows);
    } catch (err) {
      if (active.current && !signal?.aborted && sequence === claimRequest.current) { setClaims([]); setClaimsError(errorMessage(err)); }
    } finally { if (active.current && !signal?.aborted && sequence === claimRequest.current) setClaimsLoading(false); }
  }
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void loadReports(controller.signal);
      void loadClaims(controller.signal);
    }, 0);
    return () => { active.current = false; controller.abort(); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!inboxClaimRevision || inboxClaimRevision === ":") return;
    const timer = setTimeout(() => { void loadClaims(); void loadReports(); }, 0);
    return () => clearTimeout(timer);
  }, [inboxClaimRevision]);
  useEffect(() => {
    if (!notificationReport) return;
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("report", notificationReport.id);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      setShareNotice("");
      setReports(previous => previous.some(report => report.id === notificationReport.id) ? previous : [notificationReport, ...previous]);
      setFocusedClaim(notificationClaim);
      void loadClaims();
      setSelectedId(notificationReport.id); setView("detail"); onNotificationConsumed();
    }, 0);
    return () => clearTimeout(timer);
  }, [notificationReport, notificationClaim, onNotificationConsumed]);

  useEffect(() => {
    if (view !== "detail" || !focusedClaim || claimsLoading) return;
    const timer = setTimeout(() => document.getElementById(`claim-${focusedClaim}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
    return () => clearTimeout(timer);
  }, [view, focusedClaim, claimsLoading, claims]);

  useEffect(() => {
    if (!notificationMessageClaim) return;
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      if (url.searchParams.has("report")) {
        url.searchParams.delete("report");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      setSelectedMessageClaim(notificationMessageClaim);
      setView("messages");
      void loadClaims();
      onNotificationMessageConsumed();
    }, 0);
    return () => clearTimeout(timer);
  }, [notificationMessageClaim, onNotificationMessageConsumed]);

  // A shareable URL uses ?report=<uuid>. Resolve only after report loading.
  useEffect(() => {
    if (loading || loadError || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const target = new URLSearchParams(window.location.search).get("report");
    if (!target) return;
    const report = reports.find(item => item.id === target);
    // URL synchronization runs after the effect, avoiding cascading render updates.
    const timer = setTimeout(() => {
      if (report) {
        setSelectedId(report.id);
        setView("detail");
      } else {
        setNotice("This report is unavailable or is no longer accessible.");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [loading, loadError, reports]);
  function clearSharedReportUrl() {
    const url = new URL(window.location.href);
    if (url.searchParams.has("report")) {
      url.searchParams.delete("report");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }
  async function shareReport(reportId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("report", reportId);
    const link = url.toString();
    try {
      await navigator.clipboard.writeText(link);
      setShareNotice("Link copied! You can share it with other students.");
    } catch {
      window.prompt("Copy the report link:", link);
      setShareNotice("Copy this link to share the report.");
    }
  }
  const filtered = browseReports(reports, category, query);
  const categories = browseCategories(reports, postCategories);
  const selected = reports.find(r => r.id === selectedId);
  const myItems = reports.filter(r => r.user_id === user.id);
  const matchableItems = guest ? reports.filter(r => r.status === "open").slice(0, 20) : myItems.filter(r => r.status === "open");
  const myClaim = selected && claims.find(c => c.report_id === selected.id && c.claimant_id === user.id);
  const tab = view === "detail" ? "browse" : view === "edit" ? "mine" : view;
  const matchMode = sourceId ? "report" : aiMode;

  function clearAiResults() { setAiResults(null); setAnalysis(null); setAiError(""); }
  function chooseMatchMode(mode: "quick" | "report") {
    setAiMode(mode); clearAiResults();
    setSourceId(mode === "report" ? (sourceId || matchableItems[0]?.id || "") : "");
  }

  function openMessages(claimId?: string) {
    clearSharedReportUrl();
    setSelectedMessageClaim(claimId ?? null);
    setView("messages");
  }
  function startPost(type: "lost" | "found") {
    clearSharedReportUrl();
    setReportType(type); setFormKey(key => key + 1); setCompletedReport(null); setNotice(""); setView("post");
  }
  function reportSaved(report: Report, photoUploaded: boolean) {
    setReports(previous => [report, ...previous.filter(item => item.id !== report.id)]);
    setCompletedReport(report);
    setNotice(photoUploaded ? "Your report and photo are saved." : "Your report is saved.");
    if (report.report_type === "lost") {
      setAiMode("report"); setSourceId(report.id); setAiResults(null); setAnalysis(null); setAiError(""); setView("ai");
    } else setView("mine");
    void loadReports();
  }
  async function deleteOwnReport(report: Report) {
    if (guest || busy || pending.current || report.user_id !== user.id) return;
    if (!window.confirm(deleteConfirmation(report.title))) return;
    pending.current = true; setBusy(true); setActionError("");
    try {
      await sessionRequired();
      const warning = await api.deleteReport(report.id);
      setReports(previous => previous.filter(item => item.id !== report.id));
      setNotice(warning ?? "Report permanently deleted.");
      await Promise.all([loadReports(), loadClaims()]);
    } catch (err) { setActionError(errorMessage(err)); }
    finally { pending.current = false; setBusy(false); }
  }

  function openItem(report: Report) {
    const url = new URL(window.location.href);
    url.searchParams.set("report", report.id);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    setShareNotice("");
    setSelectedId(report.id); setProof(""); setActionError(""); setNotice(""); setView("detail");
    void loadClaims();
  }
  async function claim(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || guest || pending.current || claimsLoading || claimsError) return;
    const parsed = validateNewClaim({ report_id: selected.id, proof });
    if (!parsed.data) { setActionError(parsed.error); return; }
    pending.current = true; setBusy(true); setActionError(""); setNotice("");
    try {
      await sessionRequired();
      const created = await api.submitClaim(parsed.data.report_id, parsed.data.proof);
      if (!active.current) return;
      setClaims(previous => [created, ...previous.filter(c => c.id !== created.id)]);
      setProof(""); setNotice("Ownership request sent! The finder will review your proof. You can message them while you wait.");
    } catch (err) {
      if (active.current) { setActionError(errorMessage(err)); void loadClaims(); }
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }
  async function decide(claim: Claim, status: "approved" | "rejected") {
    if (guest || pending.current) return;
    const decision = status === "approved"
      ? "Approve this ownership request? The item will be reserved for this claimant. You will still need to arrange the handoff; Karma is awarded only after they confirm receipt."
      : "Decline this ownership request? The claimant will be notified and this decision cannot be undone.";
    if (!window.confirm(decision)) return;
    pending.current = true; setBusy(true); setActionError(""); setNotice("");
    try {
      await sessionRequired();
      const updated = await api.decideClaim(claim.id, status);
      if (!active.current) return;
      setClaims(previous => previous.map(c => c.id === updated.id ? updated : c));
      setNotice(updated.status === "approved" ? "Ownership approved. Message the claimant to arrange a safe pickup; they confirm receipt after the handoff." : "Claim declined. You can review other requests.");
      await Promise.all([loadReports(), loadClaims()]);
    } catch (err) { if (active.current) setActionError(errorMessage(err)); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  async function confirmHandoff(claim: Claim) {
    if (guest || pending.current || claim.claimant_id !== user.id || claim.status !== "approved" || claim.handoff_confirmed_at) return;
    const confirmed = window.confirm("Confirm you have physically received this item? This will notify the finder and count as a completed return.");
    if (!confirmed) return;
    pending.current = true; setBusy(true); setActionError(""); setNotice("");
    try {
      await sessionRequired();
      const updated = await api.confirmHandoff(claim.id);
      if (!active.current) return;
      setClaims(previous => previous.map(c => c.id === updated.id ? updated : c));
      setNotice("Return confirmed! The finder has earned 50 Campus Karma points. Thank you for helping close the loop!");
      setHandoffRefresh(n => n + 1);
      await loadClaims();
    } catch (err) { if (active.current) setActionError(errorMessage(err)); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  function openMatchFinder() {
    chooseMatchMode(!guest && matchableItems.length ? "report" : "quick");
    setView("ai");
  }
  function startMatching(report: Report) {
    setAiMode("report"); setSourceId(report.id); setAiError(""); setAiResults(null); setAnalysis(null); setView("ai");
  }
  async function runAi(event: React.FormEvent) {
    event.preventDefault();
    if (matchMode === "report" && !sourceId) return;
    if (pending.current || (matchMode === "report" ? !matchableItems.some(r => r.id === sourceId) : !aiText.trim()) || loading || loadError) return;
    pending.current = true; setBusy(true); setAiError(""); setAiResults(null); setAnalysis(null);
    try {
      await sessionRequired();
      if (matchMode === "report") {
        const result = await api.reportMatches(sourceId, reports);
        if (active.current) { setAiResults(result.matches); setAnalysis(result.analysis); }
      } else {
        const result = await api.matches(aiText.trim(), reports, { ...searchAttributes, itemDate: searchAttributes.itemDate ? new Date(searchAttributes.itemDate).toISOString() : undefined });
        if (active.current) setAiResults(result);
      }
    } catch (err) { if (active.current) setAiError(errorMessage(err)); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <>
    {completedReport && (view === "ai" || view === "mine") && <div className="success-panel" role="status"><div><span className="eyebrow">Report published</span><b>{completedReport.title}</b><p>{notice} {completedReport.report_type === "lost" ? "Compare it with campus finds below." : "You’ll be notified if someone claims it. Review their proof, arrange a handoff, and earn Karma when they confirm receipt."}</p></div><button className="button button-secondary" onClick={() => { openItem(completedReport); setCompletedReport(null); }}>View report</button></div>}
    {notice && !completedReport && <p className="notice" role="status">{notice}</p>}
    {(view === "ai" || view === "mine" || view === "detail") && <>
      {loading && <p role="status">Loading reports…</p>}
      {loadError && <p className="err" role="alert">{loadError} <button className="small" onClick={() => void loadReports()}>Retry reports</button></p>}
    </>}
    {view === "browse" && <BrowseView reports={filtered} loading={loading} error={loadError} query={query} category={category} categories={categories} mode={browseMode}
      onQuery={setQuery} onCategory={setCategory} onMode={setBrowseMode} onOpen={openItem} onLost={() => startPost("lost")} onFound={() => startPost("found")} onMatches={openMatchFinder} onRetry={() => void loadReports()} />}

    {view === "detail" && <section className="detail-page">
      <button className="back" onClick={() => { clearSharedReportUrl(); setView("browse"); }}>← Back to browse</button>
      {selected ? <div className="detail-layout">
        <div className="detail-main">
          <ReportPhoto key={selected.id} report={selected} className="detail-photo" />
          <div className="detail-copy"><div className="tags"><span className="tag">{selected.report_type === "lost" ? "Lost" : "Found"}</span><span className="tag tag-neutral">{selected.category}</span><span className="tag tag-neutral">{selected.status === "resolved" && claims.some(c => c.report_id === selected.id && c.status === "approved" && !c.handoff_confirmed_at) ? "Pickup pending" : selected.status}</span></div>
            <h1>{selected.title}</h1><p className="detail-description">{selected.description}</p><div className="report-share"><button type="button" className="button button-secondary" onClick={() => void shareReport(selected.id)}>Share item link</button>{shareNotice && <span role="status" className="note">{shareNotice}</span>}</div></div>
        </div>
        <aside className="detail-side">
          <div className="info detail-facts"><h2>Report details</h2><div><span>Location</span><b>{selected.location}</b></div><div><span>Reported</span><b>{new Date(selected.created_at).toLocaleDateString()}</b></div></div>
          {claimsLoading && <div className="state-card" role="status"><span className="spinner" />Loading claims…</div>}
          {claimsError && <div className="state-card state-error" role="alert">{claimsError} <button className="small" onClick={() => void loadClaims()}>Retry claims</button></div>}
          {myClaim ? <div id={`claim-${myClaim.id}`} className={"info claim-panel" + (focusedClaim === myClaim.id ? " focused-claim" : "")} role="status"><span className="eyebrow">Your ownership request</span><h2>{myClaim.handoff_confirmed_at ? "Return complete" : myClaim.status === "approved" ? "You're approved" : myClaim.status === "pending" ? "Request sent" : "Request declined"}</h2><ReturnJourney claim={myClaim} perspective="claimant" />{!guest && myClaim.status !== "rejected" && !myClaim.handoff_confirmed_at && <button className="button button-primary" type="button" onClick={() => openMessages(myClaim.id)}>{myClaim.status === "pending" ? "Message finder" : "Arrange pickup →"}</button>}{!guest && myClaim.status === "approved" && !myClaim.handoff_confirmed_at && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void confirmHandoff(myClaim)}>Confirm receipt</button>}</div> :
            selected.user_id !== user.id && selected.report_type === "found" && selected.status === "open" && (guest ? <div className="info claim-panel"><h2>Is this yours?</h2><p>Sign in or create an account to send private proof to the finder and request a claim.</p></div> : <form className="info claim-panel" onSubmit={claim}>
              <span className="eyebrow">Ownership request</span><h2>Is this yours?</h2><p className="claim-form-intro">Share a private detail only you would know. The finder will review it and you can message them after submitting.</p>
              <label className="field">Proof of ownership<textarea className="box" required maxLength={2000} value={proof} onChange={e => setProof(e.target.value)} placeholder="Describe a unique mark, contents, or another private detail" /></label>
              <button className="button button-primary submit-button" disabled={busy || claimsLoading || !!claimsError}>{busy ? "Submitting…" : "Send ownership request →"}</button>
            </form>)}
          {selected.user_id === user.id && selected.report_type === "found" && <div className="info claim-panel"><div className="claim-panel-heading"><div><span className="eyebrow">Your found item</span><h2>Ownership requests</h2></div><span className="claim-count">{claims.filter(c => c.report_id === selected.id && c.status === "pending").length} pending</span></div>
            {!claimsLoading && !claimsError && !claims.some(c => c.report_id === selected.id) && <p className="empty">No requests yet. We’ll notify you when someone claims this item.</p>}
            {claims.filter(c => c.report_id === selected.id).map(c => <div id={`claim-${c.id}`} className={"claim-request" + (focusedClaim === c.id ? " focused-claim" : "")} key={c.id}><ReturnJourney claim={c} perspective="finder" compact /><details className="claim-proof" open={c.status === "pending"}><summary>Proof from claimant · {new Date(c.created_at).toLocaleDateString()}</summary><p>{c.proof}</p></details>{!guest && c.status !== "rejected" && <button className={c.status === "approved" && !c.handoff_confirmed_at ? "button button-primary" : "button button-secondary"} onClick={() => openMessages(c.id)}>{c.status === "approved" && !c.handoff_confirmed_at ? "Arrange pickup →" : "Message claimant"}</button>}
              {!guest && c.status === "pending" && selected.status === "open" && <div className="claim-actions"><button className="button button-primary" disabled={busy} onClick={() => void decide(c, "approved")}>Approve ownership</button><button className="button button-secondary" disabled={busy} onClick={() => void decide(c, "rejected")}>Decline</button></div>}
            </div>)}</div>}
          {actionError && <p className="err" role="alert">{actionError}</p>}
          {selected.user_id === user.id && selected.status === "open" && !claims.some(c => c.report_id === selected.id && c.status === "pending") && <button className="button button-secondary submit-button" onClick={() => startMatching(selected)}>Find matches for this report →</button>}
        </aside>
      </div> : !loading && !loadError && <div className="state-card">This report is no longer available.</div>}
    </section>}

    {view === "ai" && <section className="matches-page ai-page">
      <div className="ai-hero">
        <span className="ai-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg></span>
        <div><span className="eyebrow">LostSignal · Gemini-assisted</span><h1>Find your match, faster.</h1>
          <p>{guest ? "Search campus items and try report matching. Gemini analysis is limited for guests." : "Search by description or compare your saved report with Gemini-assisted item analysis, location and the time lost or found."}</p></div>
      </div>

      <div className="ai-layout">
        <div className="ai-main">
          <form className="match-search-form ai-card" onSubmit={runAi}><fieldset disabled={busy}>
            <div className="ai-mode" role="radiogroup" aria-label="Search mode">
              <button type="button" role="radio" aria-checked={matchMode === "quick"} className={matchMode === "quick" ? "on" : ""} onClick={() => chooseMatchMode("quick")}><b>Quick search</b><small>Find by keywords · no Gemini</small></button>
              <button type="button" role="radio" aria-checked={matchMode === "report"} className={matchMode === "report" ? "on" : ""} onClick={() => chooseMatchMode("report")}><b>{guest ? "Try Gemini demo" : "Gemini-assisted matches"}</b><small>{guest ? "Report comparison" : "Compare photos, details and dates"}</small></button>
            </div>

            {matchMode === "quick" ? <>
              <label className="ai-search-box">
                <span className="sr-only">Describe your lost item</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <textarea required maxLength={2000} value={aiText} onChange={e => { setAiText(e.target.value); setAiResults(null); }} placeholder="Black backpack with a red keychain, lost near the library" />
              </label>
              <div className="ai-examples" aria-label="Example searches">
                {["Black backpack near the library", "AirPods case at the rec center", "UCard at the dining hall"].map(example => <button type="button" key={example} className="cat" onClick={() => { setAiText(example); setAiResults(null); }}>{example}</button>)}
              </div>
              <div className="ai-attrs">
                <label className="field">Category<select required value={searchAttributes.category} onChange={e => { setSearchAttributes({ ...searchAttributes, category: e.target.value }); setAiResults(null); }}><option value="">Choose…</option>{categories.filter(c => c !== "All").map(c => <option key={c}>{c}</option>)}</select></label>
                <label className="field">Color <span className="sub">(optional)</span><input maxLength={100} value={searchAttributes.color} placeholder="Black" onChange={e => { setSearchAttributes({ ...searchAttributes, color: e.target.value }); setAiResults(null); }} /></label>
                <label className="field">Brand <span className="sub">(optional)</span><input maxLength={100} value={searchAttributes.brand} placeholder="JanSport" onChange={e => { setSearchAttributes({ ...searchAttributes, brand: e.target.value }); setAiResults(null); }} /></label>
              </div>
              <label className="field ai-time-field">When did you lose it? <span className="sub">(optional)</span><input type="datetime-local" value={searchAttributes.itemDate} onChange={e => { setSearchAttributes({ ...searchAttributes, itemDate: e.target.value }); setAiResults(null); }} /></label>
              <p className="note ai-note">Quick search compares item names, descriptions, details, place and time. For Gemini-assisted photo analysis, choose the other mode.</p>
            </> : <>
              {matchableItems.length ? <div className="ai-report-list" role="radiogroup" aria-label={guest ? "Demo report" : "Your report"}>
                {matchableItems.map(report => <label key={report.id} className={"ai-report" + (sourceId === report.id ? " selected" : "")}>
                  <input type="radio" name="sourceReport" checked={sourceId === report.id} onChange={() => { setSourceId(report.id); clearAiResults(); }} />
                  <span className={"tag" + (report.report_type === "lost" ? "" : " tag-neutral")}>{report.report_type === "lost" ? "Lost" : "Found"}</span>
                  <span className="ai-report-text"><b>{report.title}</b><small>{report.location} · {report.item_date ? `${report.report_type === "lost" ? "Lost" : "Found"} ${new Date(report.item_date).toLocaleString()}` : `Posted ${new Date(report.created_at).toLocaleDateString()}`}</small></span>
                </label>)}
              </div> : !loading && !loadError && <div className="ai-empty">
                <b>{guest ? "No demo reports yet" : "No open reports to match"}</b>
                <p>{guest ? "No open reports are available for guest matching yet." : "Create a lost or found report, then come back to compare it with campus reports."}</p>
                {!guest && <button type="button" className="button button-secondary" onClick={() => startPost("lost")}>Create a report →</button>}
              </div>}
            </>}

            {matchMode === "report" && <div className="gemini-mode-note"><span className="gemini-mode-mark" aria-hidden="true">✦</span><div><b>Gemini-powered detail extraction</b><span>When needed and available, Gemini examines item photos or descriptions. Matching still works if AI is unavailable.</span></div></div>}
            <button className="button button-primary submit-button ai-submit" disabled={busy || loading || !!loadError || (matchMode === "report" && !sourceId)}>
              {busy ? <><span className="spinner" />Comparing reports…</> : matchMode === "report" ? "✦ Find Gemini-assisted matches" : "Search found items"}
            </button>
          </fieldset></form>

          {aiError && <p className="err" role="alert">{aiError}</p>}
          {analysis?.state === "unavailable" && <p className="notice" role="status">Gemini is unavailable. These are fallback similarity rankings from saved report details; AI analysis was not completed.</p>}
          {analysis?.state === "partial" && <p className="notice" role="status">Gemini analysis was incomplete. These rankings also use saved report details. {analysis.issues.includes("quota") ? "Gemini quota was reached." : analysis.issues.includes("timeout") ? "Gemini timed out." : "Some details could not be analyzed."}</p>}
          {analysis?.state === "completed" && <p className="notice" role="status">Gemini analysis completed for {analysis.succeeded} report{analysis.succeeded === 1 ? "" : "s"}.</p>}
          {analysis?.state === "not_needed" && <p className="note" role="status">Ranked using saved report details; Gemini analysis was not needed.</p>}

          {busy && <div className="match-results" aria-busy="true">
            <p className="note" role="status">{sourceId ? "Comparing saved reports. Gemini analysis may take a moment…" : "Ranking open found reports…"}</p>
            {[0, 1].map(i => <div className="match-card skeleton-card" key={i} aria-hidden="true"><div className="skeleton skeleton-photo" /><div className="skeleton-lines"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div></div>)}
          </div>}
          {aiResults && !busy && <div className="match-results"><div className="results-heading"><h2>{sourceId ? "Possible report matches" : "Search results"}</h2><span>{aiResults.length} {aiResults.length === 1 ? "result" : "results"}</span></div>
            {!aiResults.length && <div className="state-card"><b>No matches yet</b><p>Try another description or check again when more reports are posted.</p></div>}
            {aiResults.map(match => <MatchResultCard key={match.report.id} match={match} onOpen={openItem} />)}
          </div>}
        </div>

        <aside className="ai-side">
          <div className="ai-card ai-steps"><h2>How it works</h2>
            <ol>
              <li><b>Describe or pick</b><span>Type what you lost, or choose one of your saved reports.</span></li>
              <li><b>We compare details</b><span>Item name, color, brand, description, place and time are considered; Gemini fills in missing attributes when needed.</span></li>
              <li><b>Review and claim</b><span>Open a match and send private proof to the finder.</span></li>
            </ol>
          </div>
          <p className="ai-disclaimer">A match percentage represents shared evidence, not the probability that this is your item. Missing details can lower the ranking; dates are optional.</p>
        </aside>
      </div>
    </section>}

    {view === "post" && guest && <section className="state-card demo-signin-gate" role="region" aria-label="Sign in to report an item"><h2>Ready to report an item?</h2><p>Create a free account or sign in to share a lost or found report with the UMass community.</p><button type="button" className="button button-primary" onClick={() => void client.auth.signOut()}>Sign in or create an account →</button><button type="button" className="button button-secondary" onClick={() => setView("browse")}>Keep browsing</button></section>}
    {view === "post" && !guest && <ReportForm key={formKey} initialType={reportType} client={client} userId={user.id} guest={guest} onBack={() => setView("browse")} onTypeChange={type => startPost(type)} onSaved={reportSaved} onReportCreated={() => void loadReports()} />}

    {view === "edit" && selected && selected.user_id === user.id && !guest && <ReportEditor key={selected.id} report={selected} onBack={() => setView("mine")} onChanged={() => void loadReports()} onDone={message => { setNotice(message); setView("mine"); void loadReports(); }} />}

    {view === "mine" && guest && <section className="state-card demo-signin-gate"><h2>Track your items</h2><p>Sign in to see your posted reports, ownership requests and completed returns.</p><button className="button button-primary" onClick={() => void client.auth.signOut()}>Sign in →</button></section>}
    {view === "mine" && !guest && <section className="activity-page">
      {actionError && <p className="alert alert-error" role="alert">{actionError}</p>}
      <div className="page-heading activity-heading"><div><span className="eyebrow">Your corner</span><h1>My activity</h1><p>Everything you’ve reported or claimed, all in one place.</p></div><button className="button button-secondary" disabled={loading || claimsLoading} onClick={() => { void loadReports(); void loadClaims(); }}>Refresh activity</button></div>
      {!claimsLoading && !claimsError && (claims.some(c => c.status === "pending" && myItems.some(r => r.id === c.report_id && r.report_type === "found")) || claims.some(c => c.claimant_id === user.id && c.status === "approved" && !c.handoff_confirmed_at)) && <div className="activity-next-actions" aria-label="Items needing action">
        <div className="activity-next-title"><span className="activity-next-icon" aria-hidden="true">!</span><div><span className="eyebrow">Needs attention</span><h2>Your next steps</h2></div></div>
        {claims.filter(c => c.status === "pending" && myItems.some(r => r.id === c.report_id && r.report_type === "found")).map(c => { const report = reports.find(r => r.id === c.report_id); return <div key={c.id} className="activity-next-row"><div><b>Review an ownership request</b><p>{report?.title ?? "Found item"}</p></div>{report && <button type="button" className="button button-primary" onClick={() => openItem(report)}>Review claim →</button>}</div>; })}
        {claims.filter(c => c.claimant_id === user.id && c.status === "approved" && !c.handoff_confirmed_at).map(c => <div key={c.id} className="activity-next-row"><div><b>Have you received your item?</b><p>Confirm only after pickup.</p></div><div className="activity-next-buttons"><button type="button" className="button button-secondary" onClick={() => openMessages(c.id)}>Message finder</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void confirmHandoff(c)}>Confirm receipt</button></div></div>)}
      </div>}
      <div className="activity-layout"><section><div className="results-heading"><h2>My reports</h2><span>{myItems.length}</span></div>
        {!loading && !loadError && !myItems.length && <div className="state-card"><b>No reports yet</b><p>{guest ? "Sign in to post an item and track it here." : "Start with a lost or found report. Your updates will appear here."}</p>{!guest && <button className="button button-primary" onClick={() => startPost("lost")}>Report an item</button>}</div>}
        {myItems.map(item => {
          const pendingClaims = claims.filter(c => c.report_id === item.id && c.status === "pending");
          const approvedClaim = claims.find(c => c.report_id === item.id && c.status === "approved");
          const hasClaims = claims.some(c => c.report_id === item.id);
          const isFinished = item.status === "resolved" && (!approvedClaim || !!approvedClaim.handoff_confirmed_at);
          const pendingPickup = item.status === "resolved" && approvedClaim && !approvedClaim.handoff_confirmed_at;
          const statusText = pendingPickup ? "Pickup pending" : isFinished ? "Returned / closed" : item.status;
          return <article className="activity-card" key={item.id}>
            <ReportPhoto report={item} className="activity-photo" />
            <div>
              <div className="tags"><span className="tag">{item.report_type}</span><span className="tag tag-neutral">{statusText}</span></div>
              <h3>{item.title}</h3><p>{item.location}</p>
              {pendingClaims.length > 0 && item.report_type === "found" && item.status === "open"
                ? <div className="activity-card-priority"><b>{pendingClaims.length} ownership {pendingClaims.length === 1 ? "request" : "requests"} waiting</b><button className="button button-primary" onClick={() => openItem(item)}>Review claim →</button></div>
                : <div className="activity-actions">
                  <button className="text-action" onClick={() => openItem(item)}>View report →</button>
                  {item.status === "open" && !hasClaims && <button className="text-action" onClick={() => startMatching(item)}>Find matches →</button>}
                  {!guest && item.status === "open" && !hasClaims && !claimsLoading && !claimsError && <>
                    <button className="text-action" onClick={() => { setSelectedId(item.id); setView("edit"); }}>Edit</button>
                    <button className="text-action danger-action" disabled={busy} onClick={() => void deleteOwnReport(item)}>Delete</button>
                  </>}
                </div>}
              {pendingPickup && <p className="activity-card-note">Claim approved. Arrange pickup in Messages; the claimant confirms receipt afterward.</p>}
            </div>
          </article>;
        })}
      </section><section><div className="results-heading"><h2>My claims</h2><span>{claims.filter(c => c.claimant_id === user.id).length}</span></div>
        {claimsLoading && <div className="state-card" role="status"><span className="spinner" />Loading claims…</div>}
        {claimsError && <div className="state-card state-error" role="alert">{claimsError} <button className="small" onClick={() => void loadClaims()}>Retry claims</button></div>}
        {!claimsLoading && !claimsError && !claims.some(c => c.claimant_id === user.id) && <div className="state-card"><b>No claims submitted</b><p>Found something that belongs to you? Open its report to send private proof to the finder.</p><button className="button button-secondary" onClick={() => setView("browse")}>Browse found items</button></div>}
        {claims.filter(c => c.claimant_id === user.id).map(c => { const report = reports.find(r => r.id === c.report_id); return <div className="claim-activity" key={c.id}><h3>{report?.title ?? "Report " + c.report_id}</h3><ReturnJourney claim={c} perspective="claimant" compact />{!guest && c.status === "approved" && !c.handoff_confirmed_at && <button className="button button-primary" disabled={busy} onClick={() => void confirmHandoff(c)}>Confirm received</button>}{report && <button className="text-action" onClick={() => openItem(report)}>View report →</button>}{!guest && c.status !== "rejected" && <button className="text-action" onClick={() => openMessages(c.id)}>Message finder →</button>}</div>; })}
      </section></div>
      <section className="activity-karma-footer" aria-label="Campus Karma rewards">
        <KarmaPanel enabled={!guest} refreshKey={handoffRefresh + claims.filter(c => !!c.handoff_confirmed_at).length} />
      </section>
    </section>}

    {view === "messages" && (guest ? <div className="state-card demo-signin-gate"><h2>Message a finder or claimant</h2><p>Sign in to coordinate a safe item return.</p><button className="button button-primary" onClick={() => void client.auth.signOut()}>Sign in →</button></div> : <MessagesView key={selectedMessageClaim ?? "inbox"} client={client} userId={user.id} claims={claims} reports={reports} initialClaimId={selectedMessageClaim} onOpenReport={openItem} onBrowse={() => { clearSharedReportUrl(); setView("browse"); }} />)}

    <nav className="app-nav" aria-label="Main navigation"><div className="nav-inner">
  <button className={tab === "browse" ? "on" : ""} aria-current={tab === "browse" ? "page" : undefined} onClick={() => { clearSharedReportUrl(); setView("browse"); }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
    <span>Explore</span>
  </button>
  <button className={tab === "ai" ? "on" : ""} aria-current={tab === "ai" ? "page" : undefined} onClick={() => { clearSharedReportUrl(); setCompletedReport(null); openMatchFinder(); }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
    <span>AI Search</span>
  </button>
  <button className={"nav-post" + (tab === "post" ? " on" : "")} aria-current={tab === "post" ? "page" : undefined} onClick={() => { if (view !== "post") startPost("found"); }}>
    <svg className="post-icon" viewBox="0 0 32 32" aria-hidden="true">
      <circle className="p-ring" cx="14" cy="14" r="9" />
      <line className="p-handle" x1="21" y1="21" x2="28" y2="28" />
      <path d="M14 10v8M10 14h8" />
    </svg>
    <span>Report Item</span>
  </button>
  <button className={tab === "mine" ? "on" : ""} aria-current={tab === "mine" ? "page" : undefined} onClick={() => { clearSharedReportUrl(); setView("mine"); }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /></svg>
    <span>My Activity</span>
  </button>
  <button className={tab === "messages" ? "on" : ""} aria-current={tab === "messages" ? "page" : undefined} onClick={() => openMessages()}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.6 9.6 0 0 1-4-.9L3 21l1.7-4a8.5 8.5 0 1 1 16.3-5.5z" /></svg>
    <span>Messages {!guest && <MessagesBadge />}</span>
  </button>
</div></nav>
  </>;
}
