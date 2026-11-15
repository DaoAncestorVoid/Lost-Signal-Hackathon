"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { AuthForm, useAuth } from "./components/auth";
import { ReportPhoto } from "./components/report-photo";
import { BrowseView } from "./components/browse-view";
import { ReportForm } from "./components/report-form";
import { MatchResultCard } from "./components/match-result-card";
import { KarmaPanel } from "./components/karma-panel";
import { LostSignalApi, browseCategories, browseReports, type Report, type Claim, type RankedReport, type ReportMatchAnalysis } from "@/lib/frontend-api";
import { validateNewClaim } from "@/lib/claims/validation";

type View = "browse" | "ai" | "post" | "mine" | "detail";
const api = new LostSignalApi();
const postCategories = ["Bags", "Keys", "IDs", "Tech", "Other"];
const errorMessage = (err: unknown) => err instanceof Error ? err.message : "The request failed. Please try again.";

export default function Home() {
  const auth = useAuth();
  const [dark, setDark] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [homeSignal, setHomeSignal] = useState(0);
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
  return <>
    <header className="site-header"><div className="header-inner">
      <div className="brand"><button type="button" className="brand-btn" onClick={() => setHomeSignal(n => n + 1)} aria-label="LostSignal, go to Browse"><Image src="/icon.svg" alt="" width={38} height={38} priority /><span>Lost<span className="brand-accent">Signal</span></span></button></div>
      <div className="header-tools">
        {auth.user && <span className="account-label" title={auth.user.email ?? "Guest session"}>{auth.user.is_anonymous ? "Guest session" : auth.user.email}</span>}
        <button className="theme-button" onClick={toggleTheme} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} title={`Switch to ${dark ? "light" : "dark"} mode`}>{dark ? "☀" : "☾"}</button>
        {auth.user && <button className="button button-quiet signout" disabled={logoutBusy} onClick={logout}>{logoutBusy ? "Signing out…" : auth.user.is_anonymous ? "Sign in / Sign up" : "Sign out"}</button>}
      </div>
    </div></header>
    <main className="site-main">
      {auth.error && <p className="err" role="alert">{auth.error}</p>}
      {logoutError && <p className="err" role="alert">{logoutError}</p>}
      {auth.loading ? <div className="state-card" role="status"><span className="spinner" />Checking your session…</div> : auth.user && auth.client ? <>
        {auth.user.is_anonymous && <p className="guest-notice" role="status">Exploring as a guest. You can browse and try limited matching. Sign in to post an item or submit a claim.</p>}
        <Workspace key={auth.user.id} user={auth.user} client={auth.client} homeSignal={homeSignal} />
      </> : <div className="auth-layout"><section className="auth-story"><span className="eyebrow">Made for the UMass community</span><h1>Good things find their way back.</h1><p>LostSignal connects people who lost something with the people who found it. Share a report, explore campus finds, and take the next step with confidence.</p><div className="auth-steps"><span>01 &nbsp; Report it</span><span>02 &nbsp; Find a match</span><span>03 &nbsp; Claim it</span></div></section><AuthForm client={auth.client} /></div>}
    </main>
  </>;
}

function Workspace({ user, client, homeSignal }: { user: User; client: SupabaseClient; homeSignal: number }) {
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
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proof, setProof] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  const reportRequest = useRef(0);
  const claimRequest = useRef(0);
  const [aiText, setAiText] = useState("");
  const [searchAttributes, setSearchAttributes] = useState({ category: "", color: "", brand: "" });
  const [aiResults, setAiResults] = useState<RankedReport[] | null>(null);
  const [aiError, setAiError] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [analysis, setAnalysis] = useState<ReportMatchAnalysis | null>(null);
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

  const filtered = browseReports(reports, category, query);
  const categories = browseCategories(reports, postCategories);
  const selected = reports.find(r => r.id === selectedId);
  const myItems = reports.filter(r => r.user_id === user.id);
  const matchableItems = guest ? reports.filter(r => r.status === "open").slice(0, 20) : myItems.filter(r => r.status === "open");
  const myClaim = selected && claims.find(c => c.report_id === selected.id && c.claimant_id === user.id);
  const tab = view === "detail" ? "browse" : view;

  function startPost(type: "lost" | "found") {
    setReportType(type); setFormKey(key => key + 1); setCompletedReport(null); setNotice(""); setView("post");
  }
  function reportSaved(report: Report, photoUploaded: boolean) {
    setReports(previous => [report, ...previous.filter(item => item.id !== report.id)]);
    setCompletedReport(report);
    setNotice(photoUploaded ? "Your report and photo are saved." : "Your report is saved.");
    if (report.report_type === "lost") {
      setSourceId(report.id); setAiResults(null); setAnalysis(null); setAiError(""); setView("ai");
    } else setView("mine");
    void loadReports();
  }

  function openItem(report: Report) {
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
      setProof(""); setNotice("Claim submitted. The finder must review your proof.");
    } catch (err) {
      if (active.current) { setActionError(errorMessage(err)); void loadClaims(); }
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }
  async function decide(claim: Claim, status: "approved" | "rejected") {
    if (guest || pending.current) return;
    pending.current = true; setBusy(true); setActionError(""); setNotice("");
    try {
      await sessionRequired();
      const updated = await api.decideClaim(claim.id, status);
      if (!active.current) return;
      setClaims(previous => previous.map(c => c.id === updated.id ? updated : c));
      setNotice("Claim " + updated.status + ".");
      await Promise.all([loadReports(), loadClaims()]);
    } catch (err) { if (active.current) setActionError(errorMessage(err)); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  function startMatching(report: Report) {
    setSourceId(report.id); setAiError(""); setAiResults(null); setAnalysis(null); setView("ai");
  }
  async function runAi(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || (sourceId ? !matchableItems.some(r => r.id === sourceId) : !aiText.trim()) || loading || loadError) return;
    pending.current = true; setBusy(true); setAiError(""); setAiResults(null); setAnalysis(null);
    try {
      await sessionRequired();
      if (sourceId) {
        const result = await api.reportMatches(sourceId, reports);
        if (active.current) { setAiResults(result.matches); setAnalysis(result.analysis); }
      } else {
        const result = await api.matches(aiText.trim(), reports, searchAttributes);
        if (active.current) setAiResults(result);
      }
    } catch (err) { if (active.current) setAiError(errorMessage(err)); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <>
    {completedReport && (view === "ai" || view === "mine") && <div className="success-panel" role="status"><div><span className="eyebrow">Report published</span><b>{completedReport.title}</b><p>{notice} {completedReport.report_type === "lost" ? "Compare it with campus finds below." : "You can track claims in your activity."}</p></div><button className="button button-secondary" onClick={() => { openItem(completedReport); setCompletedReport(null); }}>View report</button></div>}
    {notice && !completedReport && <p className="notice" role="status">{notice}</p>}
    {(view === "ai" || view === "mine" || view === "detail") && <>
      {loading && <p role="status">Loading reports…</p>}
      {loadError && <p className="err" role="alert">{loadError} <button className="small" onClick={() => void loadReports()}>Retry reports</button></p>}
    </>}
    {view === "browse" && <BrowseView reports={filtered} loading={loading} error={loadError} query={query} category={category} categories={categories} mode={browseMode}
      onQuery={setQuery} onCategory={setCategory} onMode={setBrowseMode} onOpen={openItem} onLost={() => startPost("lost")} onFound={() => startPost("found")} onMatches={() => setView("ai")} onRetry={() => void loadReports()} />}

    {view === "detail" && <section className="detail-page">
      <button className="back" onClick={() => setView("browse")}>← Back to browse</button>
      {selected ? <div className="detail-layout">
        <div className="detail-main">
          <ReportPhoto key={selected.id} report={selected} className="detail-photo" />
          <div className="detail-copy"><div className="tags"><span className="tag">{selected.report_type === "lost" ? "Lost" : "Found"}</span><span className="tag tag-neutral">{selected.category}</span><span className="tag tag-neutral">{selected.status}</span></div>
            <h1>{selected.title}</h1><p className="detail-description">{selected.description}</p></div>
        </div>
        <aside className="detail-side">
          <div className="info detail-facts"><h2>Report details</h2><div><span>Location</span><b>{selected.location}</b></div><div><span>Reported</span><b>{new Date(selected.created_at).toLocaleDateString()}</b></div></div>
          {claimsLoading && <div className="state-card" role="status"><span className="spinner" />Loading claims…</div>}
          {claimsError && <div className="state-card state-error" role="alert">{claimsError} <button className="small" onClick={() => void loadClaims()}>Retry claims</button></div>}
          {myClaim ? <div className="info claim-panel" role="status"><span className="eyebrow">Your claim</span><h2>Status: {myClaim.status}</h2><p>{myClaim.status === "pending" ? "The finder will review the details you provided." : myClaim.status === "approved" ? "The finder approved your claim." : "This claim was not approved."}</p></div> :
            selected.user_id !== user.id && selected.report_type === "found" && selected.status === "open" && (guest ? <div className="info claim-panel"><h2>Is this yours?</h2><p>Sign in or create an account to send private proof to the finder and request a claim.</p></div> : <form className="info claim-panel" onSubmit={claim}>
              <span className="eyebrow">Take the next step</span><h2>Is this yours?</h2><p>Share a detail only the owner would know. Your proof is visible only to you and the finder.</p>
              <label className="field">Proof of ownership<textarea className="box" required maxLength={2000} value={proof} onChange={e => setProof(e.target.value)} placeholder="Describe a unique mark, contents, or another private detail" /></label>
              <button className="button button-primary submit-button" disabled={busy || claimsLoading || !!claimsError}>{busy ? "Submitting…" : "Request this item"}</button>
            </form>)}
          {selected.user_id === user.id && selected.report_type === "found" && <div className="info claim-panel"><span className="eyebrow">Owner requests</span><h2>Claims on this report</h2>
            {!claimsLoading && !claimsError && !claims.some(c => c.report_id === selected.id) && <p className="empty">No one has claimed this item yet. New requests will appear here.</p>}
            {claims.filter(c => c.report_id === selected.id).map(c => <div className="claim-request" key={c.id}><span className="tag tag-neutral">{c.status}</span><p>{c.proof}</p>
              {!guest && c.status === "pending" && selected.status === "open" && <div className="claim-actions"><button className="button button-primary" disabled={busy} onClick={() => void decide(c, "approved")}>Approve</button><button className="button button-secondary" disabled={busy} onClick={() => void decide(c, "rejected")}>Reject</button></div>}
            </div>)}</div>}
          {actionError && <p className="err" role="alert">{actionError}</p>}
          {selected.user_id === user.id && selected.status === "open" && <button className="button button-secondary submit-button" onClick={() => startMatching(selected)}>Find matches for this report →</button>}
        </aside>
      </div> : !loading && !loadError && <div className="state-card">This report is no longer available.</div>}
    </section>}

    {view === "ai" && <section className="matches-page">
      <div className="page-heading"><span className="eyebrow">Match finder</span><h1>Find a possible match</h1>
        <p>{guest ? "Explore how an existing campus report compares with other reports. Guest analysis is limited." : "Compare your saved report with open reports from the other side of lost and found."} Similarity scores describe shared details, not proof of ownership.</p></div>
      <form className="match-search-form" onSubmit={runAi}><fieldset disabled={busy}>
        <label className="field">{guest ? "Demo report" : "Your report"}
          <select value={sourceId} onChange={e => { setSourceId(e.target.value); setAiResults(null); setAnalysis(null); setAiError(""); }}>
            <option value="">Quick text search (weighted ranking only)</option>
            {matchableItems.map(report => <option key={report.id} value={report.id}>{report.report_type === "lost" ? "Lost" : "Found"}: {report.title}</option>)}
          </select>
        </label>
        {!loading && !loadError && !matchableItems.length && <p className="note">{guest ? "No open reports are available for guest matching yet." : "Create a lost or found report to compare it with campus reports."}</p>}
        {!sourceId && <>
          <p className="note">Quick search uses weighted similarity only. {guest ? "Choose an open demo report for limited Gemini analysis." : "Save a report to request Gemini analysis."}</p>
          <textarea className="box" required maxLength={2000} value={aiText} onChange={e => { setAiText(e.target.value); setAiResults(null); }} placeholder="Black backpack with a red keychain, lost near the library" aria-label="Describe your lost item" />
          <label className="field">Item category<select required value={searchAttributes.category} onChange={e => { setSearchAttributes({ ...searchAttributes, category: e.target.value }); setAiResults(null); }}><option value="">Choose a category</option>{categories.filter(c => c !== "All").map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="field">Color (optional)<input maxLength={100} value={searchAttributes.color} onChange={e => { setSearchAttributes({ ...searchAttributes, color: e.target.value }); setAiResults(null); }} /></label>
          <label className="field">Brand (optional)<input maxLength={100} value={searchAttributes.brand} onChange={e => { setSearchAttributes({ ...searchAttributes, brand: e.target.value }); setAiResults(null); }} /></label>
        </>}
        <button className="button button-primary submit-button" disabled={busy || loading || !!loadError}>{busy ? "Comparing reports…" : sourceId ? "Find report matches" : "Search found items"}</button>
      </fieldset></form>
      {busy && <div className="state-card" role="status"><span className="spinner" />{sourceId ? "Comparing saved reports. Gemini analysis may take a moment…" : "Ranking open found reports…"}</div>}
      {aiError && <p className="err" role="alert">{aiError}</p>}
      {analysis?.state === "unavailable" && <p className="notice" role="status">Gemini is unavailable. These are fallback similarity rankings from saved report details; AI analysis was not completed.</p>}
      {analysis?.state === "partial" && <p className="notice" role="status">Gemini analysis was incomplete. These rankings also use saved report details. {analysis.issues.includes("quota") ? "Gemini quota was reached." : analysis.issues.includes("timeout") ? "Gemini timed out." : "Some details could not be analyzed."}</p>}
      {analysis?.state === "completed" && <p className="notice" role="status">Gemini analysis completed for {analysis.succeeded} report{analysis.succeeded === 1 ? "" : "s"}.</p>}
      {analysis?.state === "not_needed" && <p className="note" role="status">Ranked using saved report details; Gemini analysis was not needed.</p>}
      {aiResults && <div className="match-results"><div className="results-heading"><h2>{sourceId ? "Possible report matches" : "Search results"}</h2><span>{aiResults.length} {aiResults.length === 1 ? "result" : "results"}</span></div>
        {!aiResults.length && <div className="state-card"><b>No matches yet</b><p>Try another description or check again when more reports are posted.</p></div>}
        {aiResults.map(match => <MatchResultCard key={match.report.id} match={match} onOpen={openItem} />)}
      </div>}
    </section>}

    {view === "post" && (guest ? <section className="gate-page"><button className="back" onClick={() => setView("browse")}>← Back to browse</button><div className="state-card"><span className="eyebrow">Account required</span><h1>Ready to report an item?</h1><p>Sign in or create an account to publish a report, upload a photo, and manage claims. Use “Sign in / Sign up” in the header to continue.</p></div></section> :
      <ReportForm key={formKey} initialType={reportType} client={client} userId={user.id} onBack={() => setView("browse")} onSaved={reportSaved} onReportCreated={() => void loadReports()} />)}

    {view === "mine" && <section className="activity-page">
      <KarmaPanel enabled={!guest} refreshKey={claims.filter(c => c.status === "approved").length} />
      <div className="page-heading activity-heading"><div><span className="eyebrow">Your corner</span><h1>My activity</h1><p>Track your reports, matching, and ownership requests.</p></div><button className="button button-secondary" disabled={loading || claimsLoading} onClick={() => { void loadReports(); void loadClaims(); }}>Refresh activity</button></div>
      <div className="activity-layout"><section><div className="results-heading"><h2>My reports</h2><span>{myItems.length}</span></div>
        {!loading && !loadError && !myItems.length && <div className="state-card"><b>No reports yet</b><p>{guest ? "Sign in to post an item and track it here." : "Start with a lost or found report. Your updates will appear here."}</p>{!guest && <button className="button button-primary" onClick={() => startPost("lost")}>Report an item</button>}</div>}
        {myItems.map(item => <article className="activity-card" key={item.id}><ReportPhoto report={item} className="activity-photo" /><div><div className="tags"><span className="tag">{item.report_type}</span><span className="tag tag-neutral">{item.status}</span></div><h3>{item.title}</h3><p>{item.location}</p><div className="activity-actions"><button className="text-action" onClick={() => openItem(item)}>View report →</button>{item.status === "open" && <button className="text-action" onClick={() => startMatching(item)}>Find matches →</button>}</div>{item.report_type === "found" && claims.some(c => c.report_id === item.id && c.status === "pending") && <span className="activity-notification">Pending claim to review</span>}</div></article>)}
      </section><section><div className="results-heading"><h2>My claims</h2><span>{claims.filter(c => c.claimant_id === user.id).length}</span></div>
        {claimsLoading && <div className="state-card" role="status"><span className="spinner" />Loading claims…</div>}
        {claimsError && <div className="state-card state-error" role="alert">{claimsError} <button className="small" onClick={() => void loadClaims()}>Retry claims</button></div>}
        {!claimsLoading && !claimsError && !claims.some(c => c.claimant_id === user.id) && <div className="state-card"><b>No claims submitted</b><p>Found something that belongs to you? Open its report to send private proof to the finder.</p><button className="button button-secondary" onClick={() => setView("browse")}>Browse found items</button></div>}
        {claims.filter(c => c.claimant_id === user.id).map(c => { const report = reports.find(r => r.id === c.report_id); return <div className="claim-activity" key={c.id}><span className="tag tag-neutral">{c.status}</span><h3>{report?.title ?? "Report " + c.report_id}</h3><p>Claim submitted {new Date(c.created_at).toLocaleDateString()}</p>{report && <button className="text-action" onClick={() => openItem(report)}>View report →</button>}</div>; })}
      </section></div>
    </section>}

    <nav className="app-nav" aria-label="Main navigation"><div className="nav-inner">
      <button className={tab === "browse" ? "on" : ""} aria-current={tab === "browse" ? "page" : undefined} onClick={() => setView("browse")}>Explore</button>
      <button className={tab === "ai" ? "on" : ""} aria-current={tab === "ai" ? "page" : undefined} onClick={() => { setCompletedReport(null); setView("ai"); }}>Find matches</button>
      <button className={tab === "post" ? "on" : ""} aria-current={tab === "post" ? "page" : undefined} onClick={() => { if (view !== "post") startPost("found"); }}>Report item</button>
      <button className={tab === "mine" ? "on" : ""} aria-current={tab === "mine" ? "page" : undefined} onClick={() => setView("mine")}>My activity</button>
    </div></nav>
  </>;
}
