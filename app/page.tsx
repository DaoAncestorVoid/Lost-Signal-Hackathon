"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { AuthForm, useAuth } from "./components/auth";
import { ReportPhoto } from "./components/report-photo";
import { ReportGrid } from "./components/report-card";
import { LostSignalApi, browseReports, saveReport, type Report, type Claim, type ReportMatches } from "@/lib/frontend-api";
import { validateNewReport } from "@/lib/reports/validation";
import { validateNewClaim } from "@/lib/claims/validation";
import { validateImage } from "@/lib/reports/images";

type View = "browse" | "ai" | "post" | "mine" | "chat" | "detail";
const api = new LostSignalApi();
const postCategories = ["Bags", "Keys", "IDs", "Tech", "Other"];
const initialForm = { name: "", place: "", description: "", category: "Bags" };
const errorMessage = (err: unknown) => err instanceof Error ? err.message : "The request failed. Please try again.";

export default function Home() {
  const auth = useAuth();
  const [dark, setDark] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
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
    <main>
      <div className="row">
        <h1 className="brand">
          <Image src="/icon.svg" alt="" width={40} height={40} />
          LostSignal
        </h1>
        <button className="tog" onClick={toggleTheme} aria-pressed={dark}>Dark mode: {dark ? "on" : "off"}</button>
      </div>
      {auth.error && <p className="err" role="alert">{auth.error}</p>}
      {logoutError && <p className="err" role="alert">{logoutError}</p>}
      {auth.loading ? <p role="status">Checking your session…</p> : auth.user && auth.client ? <>
        <div className="account row"><span className="sub">{auth.user.email}</span><button className="small" disabled={logoutBusy} onClick={logout}>{logoutBusy ? "Signing out…" : "Sign out"}</button></div>
        <Workspace key={auth.user.id} user={auth.user} client={auth.client} />
      </> : <AuthForm client={auth.client} />}
    </main>
  </>;
}

function Workspace({ user, client }: { user: User; client: SupabaseClient }) {
  const [view, setView] = useState<View>("browse");
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
  const [matchReportId, setMatchReportId] = useState("");
  const [aiResults, setAiResults] = useState<ReportMatches | null>(null);
  const [aiError, setAiError] = useState("");
  const [reportType, setReportType] = useState<"lost" | "found">("found");
  const [form, setForm] = useState(initialForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photo, setPhoto] = useState("");
  const [photoInput, setPhotoInput] = useState(0);
  const [savedReport, setSavedReport] = useState<Report | undefined>();
  const [formError, setFormError] = useState("");
  const [postBusy, setPostBusy] = useState(false);
  const posting = useRef(false);
  const photoSelection = useRef(0);
  const [photoValidating, setPhotoValidating] = useState(false);

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
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    // The callback runs outside the effect setup and only for this file.
    const timer = setTimeout(() => setPhoto(url), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [photoFile]);

  const filtered = browseReports(reports, category, query);
  const categories = ["All", ...new Set([...postCategories, ...reports.map(r => r.category)])];
  const selected = reports.find(r => r.id === selectedId);
  const myItems = reports.filter(r => r.user_id === user.id);
  const matchableReports = myItems.filter(r => r.report_type === "lost" && r.status === "open");
  const myClaim = selected && claims.find(c => c.report_id === selected.id && c.claimant_id === user.id);
  const tab = view === "detail" ? "browse" : view;

  function openItem(report: Report) {
    setSelectedId(report.id); setProof(""); setActionError(""); setNotice(""); setView("detail");
    void loadClaims();
  }
  function showMatches(report: Report) {
    setMatchReportId(report.id); setAiResults(null); setAiError(""); setView("ai");
  }
  async function claim(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || pending.current || claimsLoading || claimsError) return;
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
    if (pending.current) return;
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
  async function runAi(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !matchReportId || !matchableReports.some(r => r.id === matchReportId) || loading || loadError) return;
    pending.current = true; setBusy(true); setAiError(""); setAiResults(null);
    try {
      await sessionRequired();
      const result = await api.reportMatches(matchReportId, reports);
      if (active.current) setAiResults(result);
    } catch (err) { if (active.current) setAiError(errorMessage(err)); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const sequence = ++photoSelection.current;
    if (!file) return;
    setFormError("");
    setPhotoValidating(true);
    try {
      const result = await validateImage(file);
      if (!active.current || sequence !== photoSelection.current) return;
      if ("error" in result) { setFormError(result.error); event.target.value = ""; return; }
      setPhoto(""); setPhotoFile(file);
    } catch (err) { if (active.current) setFormError(errorMessage(err)); }
    finally { if (active.current && sequence === photoSelection.current) setPhotoValidating(false); }
  }
  function resetForm() {
    photoSelection.current++;
    setPhotoValidating(false);
    setForm(initialForm); setReportType("found"); setPhotoFile(null); setPhoto(""); setSavedReport(undefined);
    setPhotoInput(n => n + 1); setFormError("");
  }
  async function postItem(event: React.FormEvent) {
    event.preventDefault();
    if (posting.current || photoValidating) return;
    const validation = validateNewReport({
      report_type: reportType, title: form.name, description: form.description,
      category: form.category, location: form.place,
    });
    if (!validation.data) { setFormError(validation.error); return; }
    posting.current = true; setPostBusy(true); setFormError(""); setNotice("");
    try {
      await sessionRequired();
      const result = await saveReport(api, validation.data, photoFile, savedReport);
      if (!active.current) return;
      if (result.uploadError) {
        setSavedReport(result.report);
        setFormError("Report saved, but photo upload failed: " + result.uploadError + ". Retry the photo upload below; this will not create another report.");
        await loadReports();
        return;
      }
      const createdType = result.report.report_type;
      resetForm();
      setNotice("Your report" + (photoFile ? " and photo were" : " was") + " saved.");
      setView(createdType === "lost" ? "ai" : "mine");
      if (createdType === "lost") { setMatchReportId(result.report.id); setAiResults(null); setAiError(""); }
      await loadReports();
    } catch (err) { if (active.current) setFormError(errorMessage(err)); }
    finally { posting.current = false; if (active.current) setPostBusy(false); }
  }

  return <>
    {notice && <p className="notice" role="status">{notice}</p>}
    {(view === "ai" || view === "mine" || view === "detail") && <>
      {loading && <p role="status">Loading reports…</p>}
      {loadError && <p className="err" role="alert">{loadError} <button className="small" onClick={() => void loadReports()}>Retry reports</button></p>}
    </>}
    {view === "browse" && <section>
      <div className="sbar">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search found items…" aria-label="Search found items" />
        <button className="ai" onClick={() => setView("ai")}>AI</button>
      </div>
      <div className="cats">{categories.map(c => <button key={c} className={"cat" + (category === c ? " on" : "")} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
      <div className="row"><h2>Recently found</h2><button className="small" disabled={loading} onClick={() => void loadReports()}>Refresh</button></div>
      <ReportGrid reports={filtered} loading={loading} error={loadError} onRetry={() => void loadReports()} onOpen={openItem} />
    </section>}

    {view === "detail" && <section>
      <button className="back" onClick={() => setView("browse")}>← Back</button>
      {selected ? <>
        <ReportPhoto key={selected.id} report={selected} className="hero" />
        <h2 style={{ fontSize: 22 }}>{selected.title}</h2>
        <div className="tags"><span className="tag">{selected.category}</span><span className="tag">{selected.status}</span></div>
        <div className="info"><p>{selected.description}</p><div><b>Location:</b> {selected.location}</div><div><b>Reported:</b> {new Date(selected.created_at).toLocaleDateString()}</div></div>
        {selected.user_id === user.id && selected.report_type === "lost" && selected.status === "open" &&
          <button className="big" onClick={() => showMatches(selected)}>Find matches for this report</button>}
        {claimsLoading && <p role="status">Loading claims…</p>}
        {claimsError && <p className="err" role="alert">{claimsError} <button className="small" onClick={() => void loadClaims()}>Retry claims</button></p>}
        {myClaim ? <p role="status">Your claim: <b>{myClaim.status}</b></p> :
          selected.user_id !== user.id && selected.report_type === "found" && selected.status === "open" && <form onSubmit={claim}>
            <label className="field">Proof of ownership<textarea className="box" required maxLength={2000} value={proof} onChange={e => setProof(e.target.value)} placeholder="Describe details only the owner would know. Only you and the finder can see this." /></label>
            <button className="big" disabled={busy || claimsLoading || !!claimsError}>{busy ? "Submitting…" : "This is mine — request claim"}</button>
          </form>}
        {selected.user_id === user.id && <>
          <h2>Claims on this report</h2>
          {!claimsLoading && !claimsError && !claims.some(c => c.report_id === selected.id) && <p className="empty">No claims yet.</p>}
          {claims.filter(c => c.report_id === selected.id).map(c => <div className="info" key={c.id}>
            <p>{c.proof}</p><span className="tag">{c.status}</span>
            {c.status === "pending" && selected.status === "open" && <div className="row">
              <button className="small" disabled={busy} onClick={() => void decide(c, "approved")}>Approve claim</button>
              <button className="small" disabled={busy} onClick={() => void decide(c, "rejected")}>Reject claim</button>
            </div>}
          </div>)}
        </>}
        {actionError && <p className="err" role="alert">{actionError}</p>}
        <button className="btn2" disabled>Messaging is not available yet</button>
      </> : !loading && !loadError && <p className="empty">This report is no longer available.</p>}
    </section>}

    {view === "ai" && <section>
      <h2 style={{ fontSize: 20 }}>Find my item</h2>
      <p className="note">Choose a saved lost report to compare with open found reports. Scores measure similarity, not ownership. Gemini may add analysis when the saved details need it.</p>
      {!loading && !loadError && !matchableReports.length && <p className="empty">No open lost reports yet. Post a lost item to request matches.</p>}
      <form onSubmit={runAi}>
        <fieldset disabled={busy}>
        <label className="field">Lost report<select required value={matchReportId} onChange={e => { setMatchReportId(e.target.value); setAiResults(null); setAiError(""); }}><option value="">Choose a saved report</option>{matchableReports.map(r => <option key={r.id} value={r.id}>{r.title} — {r.location}</option>)}</select></label>
        <button className="big" disabled={busy || loading || !!loadError || !matchableReports.length}>{busy ? "Checking reports and Gemini…" : "Find matches"}</button>
        </fieldset>
      </form>
      {busy && <p role="status">Comparing reports. Gemini analysis may take a moment…</p>}
      {aiError && <p className="err" role="alert">{aiError}</p>}
      {aiResults && <>
        {aiResults.analysis.state === "unavailable" && <p className="notice" role="status">Gemini is unavailable. These are fallback similarity rankings from saved report details; AI analysis was not completed.</p>}
        {aiResults.analysis.state === "partial" && <p className="notice" role="status">Gemini analysis was incomplete. These rankings also use saved report details. {aiResults.analysis.issues.includes("quota") ? "Gemini quota was reached." : aiResults.analysis.issues.includes("timeout") ? "Gemini timed out." : "Some details could not be analyzed."}</p>}
        {aiResults.analysis.state === "completed" && <p className="notice" role="status">Gemini analysis completed for {aiResults.analysis.succeeded} report{aiResults.analysis.succeeded === 1 ? "" : "s"}.</p>}
        {aiResults.analysis.state === "not_needed" && <p className="note" role="status">Ranked using saved report details; Gemini analysis was not needed.</p>}
        <h2>Report matches</h2>
        {!aiResults.matches.length && <p className="empty">No matching open found reports yet. Check back later.</p>}
        {aiResults.matches.map(({ report, score, reasons }) => <button className="match" key={report.id} onClick={() => openItem(report)}>
          <ReportPhoto report={report} className="th" /><div><b>{report.title}</b><div className="sub">{report.location}</div><span className="tag">{score}/100 similarity</span><p className="note">{reasons.join(" · ")}</p></div>
        </button>)}
      </>}
    </section>}

    {view === "post" && <form onSubmit={postItem} aria-busy={postBusy}>
      <h2 style={{ fontSize: 20 }}>Post an item</h2>
      <p className="note">Photo: JPEG, PNG or WebP, up to 5 MiB. Keep identifying private details out of the public description.</p>
      <label className="snap">
        {photoFile && photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Selected item preview" className="prev" />
        ) : "Choose or take a photo"}
        <input key={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} disabled={postBusy} aria-label="Item photo" className="photo-input" />
      </label>
      <fieldset disabled={postBusy || !!savedReport}>
        <label className="field">Report type<select value={reportType} onChange={e => setReportType(e.target.value as "lost" | "found")}><option value="found">Found item</option><option value="lost">Lost item</option></select></label>
        <label className="field">Item name<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Black backpack" /></label>
        <label className="field">Description<textarea className="box" required maxLength={3000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={reportType === "lost" ? "Describe identifying details that could help match your item." : "Describe the item and where it is being held."} /></label>
        <label className="field">Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{postCategories.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="field">{reportType === "lost" ? "Where did you lose it?" : "Where did you find it?"}<input required maxLength={200} value={form.place} onChange={e => setForm({ ...form, place: e.target.value })} placeholder="Library, 2nd floor" /></label>
      </fieldset>
      {formError && <p className="err" role="alert">{formError}</p>}
      <button className="big" disabled={postBusy || photoValidating}>{postBusy ? "Saving…" : photoValidating ? "Checking photo…" : savedReport ? "Retry photo upload" : reportType === "lost" ? "Post lost item" : "Post found item"}</button>
      {savedReport && <button type="button" className="btn2" disabled={postBusy} onClick={() => {
        const saved = savedReport;
        resetForm(); setNotice("The report is saved without a confirmed photo upload.");
        if (saved.report_type === "lost") { setMatchReportId(saved.id); setAiResults(null); setView("ai"); }
        else setView("mine");
      }}>Keep saved report and finish without photo</button>}
    </form>}

    {view === "mine" && <section>
      <div className="row"><h2 style={{ fontSize: 20 }}>My items and claims</h2><button className="small" disabled={loading || claimsLoading} onClick={() => { void loadReports(); void loadClaims(); }}>Refresh</button></div>
      {!loading && !loadError && !myItems.length && <p className="empty">You have not posted anything yet. Tap + to post an item.</p>}
      {myItems.map(item => <button className="match" key={item.id} onClick={() => openItem(item)}><ReportPhoto report={item} className="th" /><div><b>{item.title}</b><div className="sub">{item.location}</div><span className="tag">{item.report_type} · {item.status}</span></div></button>)}
      <h2>Your claims</h2>
      {claimsLoading && <p role="status">Loading claims…</p>}
      {claimsError && <p className="err" role="alert">{claimsError} <button className="small" onClick={() => void loadClaims()}>Retry claims</button></p>}
      {!claimsLoading && !claimsError && !claims.some(c => c.claimant_id === user.id) && <p className="empty">No claims submitted.</p>}
      {claims.filter(c => c.claimant_id === user.id).map(c => {
        const report = reports.find(r => r.id === c.report_id);
        return <div className="info" key={c.id}><b>{report?.title ?? "Report " + c.report_id}</b><div className="tag">{c.status}</div>{report && <button className="small" onClick={() => openItem(report)}>View report</button>}</div>;
      })}
    </section>}

    {view === "chat" && <section><h2 style={{ fontSize: 20 }}>Messages</h2><p className="empty">Messaging is not available yet. Use the claim form to privately provide proof to the finder.</p><form className="send"><input disabled placeholder="Messaging backend not available" aria-label="Message (unavailable)" /><button disabled>Send</button></form></section>}

    <nav aria-label="Main navigation"><div>
      <button className={tab === "browse" ? "on" : ""} aria-current={tab === "browse" ? "page" : undefined} onClick={() => setView("browse")}>Browse</button>
      <button className={tab === "ai" ? "on" : ""} aria-current={tab === "ai" ? "page" : undefined} onClick={() => setView("ai")}>AI search</button>
      <button className="plus" aria-label="Post an item" onClick={() => setView("post")}>+</button>
      <button className={tab === "mine" ? "on" : ""} aria-current={tab === "mine" ? "page" : undefined} onClick={() => setView("mine")}>My items</button>
      <button className={tab === "chat" ? "on" : ""} aria-current={tab === "chat" ? "page" : undefined} onClick={() => setView("chat")}>Messages</button>
    </div></nav>
  </>;
}
