"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LostSignalApi, ReportSchema, saveReport, type Report } from "@/lib/frontend-api";
import { validateImage } from "@/lib/reports/images";
import { blankDraft, nextStep, parseDraft, previousStep, reportPayload, stepError, type WizardDraft, type WizardStep } from "@/lib/report-wizard";
import { LocationPicker } from "./campus-map/location-picker";

const api = new LostSignalApi();
const categories = ["Bags", "Keys", "IDs", "Tech", "Other"];

export function ReportForm({ initialType, client, userId, guest = false, onBack, onSaved, onReportCreated, onTypeChange }: {
  initialType: WizardDraft["type"];
  onTypeChange?: (type: WizardDraft["type"]) => void;
  client: SupabaseClient;
  userId: string;
  guest?: boolean;
  onBack: () => void;
  onSaved: (report: Report, photoUploaded: boolean) => void;
  onReportCreated: () => void;
}) {
  const storageKey = `lostsignal-report-draft-v2-${userId}-${initialType}`;
  const [draft, setDraft] = useState<WizardDraft>(() => blankDraft(initialType));
  const [step, setStep] = useState<WizardStep>(1);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [photoMissing, setPhotoMissing] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [photoKey, setPhotoKey] = useState(0);
  const [savedReport, setSavedReport] = useState<Report | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [validatingPhoto, setValidatingPhoto] = useState(false);
  const posting = useRef(false);
  const photoSelection = useRef(0);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        // Discard account-agnostic legacy drafts so users cannot inherit them.
        sessionStorage.removeItem(`lostsignal-report-draft-v1-${initialType}`);
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const value = JSON.parse(raw);
          const parsed = parseDraft(value);
          if (parsed) {
            setDraft(parsed.draft); setStep(parsed.step); setRestored(true);
            setPhotoMissing(value.hadPhoto === true);
            const report = ReportSchema.safeParse(value.savedReport);
            if (report.success) { setSavedReport(report.data); setStep(3); }
          }
        }
      } catch { /* Storage can be unavailable in private browsing. */ }
      setReady(true);
    });
    return () => { active = false; };
  }, [storageKey, initialType]);
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ draft, step, hadPhoto: Boolean(photoFile) || photoMissing, savedReport })); } catch {}
  }, [ready, draft, step, photoFile, photoMissing, savedReport, storageKey]);
  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    const timer = setTimeout(() => setPreview(url), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [photoFile]);

  function update<Key extends keyof WizardDraft>(key: Key, value: WizardDraft[Key]) {
    setDraft(previous => ({ ...previous, [key]: value })); setError("");
  }
  function goTo(next: WizardStep) { setStep(next); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function continueStep() {
    const message = stepError(step, draft);
    if (message) { setError(message); return; }
    goTo(nextStep(step));
  }
  async function selectPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const sequence = ++photoSelection.current;
    if (!file) return;
    setError(""); setValidatingPhoto(true);
    try {
      const result = await validateImage(file);
      if (sequence !== photoSelection.current) return;
      if ("error" in result) { setError(result.error); event.target.value = ""; return; }
      setPreview(""); setPhotoFile(file); setPhotoMissing(false);
    } catch (caught) {
      if (sequence === photoSelection.current) setError(caught instanceof Error ? caught.message : "Unable to check this photo.");
    } finally { if (sequence === photoSelection.current) setValidatingPhoto(false); }
  }
  function removePhoto() { photoSelection.current++; setPhotoFile(null); setPreview(""); setPhotoMissing(false); setPhotoKey(key => key + 1); }
  function finish(report: Report, photoUploaded: boolean) {
    try { sessionStorage.removeItem(storageKey); } catch {}
    onSaved(report, photoUploaded);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (posting.current || validatingPhoto) return;
    const message = stepError(1, draft) || stepError(2, draft);
    if (message) { setError(message); return; }
    if (guest) { setError("Sign in or create an account to post. Your text draft will stay in this tab; reselect your photo afterward."); return; }
    let payload;
    try { payload = reportPayload(draft); } catch (caught) { setError(caught instanceof Error ? caught.message : "Please check your report details."); return; }
    posting.current = true; setBusy(true); setError("");
    try {
      const { data, error: sessionError } = await client.auth.getUser();
      if (sessionError || data.user?.id !== userId) throw new Error("Your session has expired. Sign in again. Your draft is saved in this tab.");
      const result = await saveReport(api, payload, photoFile, savedReport);
      if (result.uploadError) {
        setSavedReport(result.report);
        setError(`Your report was saved, but the photo did not upload: ${result.uploadError}. Retry the photo or continue without it.`);
        onReportCreated();
        return;
      }
      finish(result.report, Boolean(photoFile));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The report could not be saved. Please retry."); }
    finally { posting.current = false; setBusy(false); }
  }

  const title = draft.type === "found" ? "What did you find?" : "What did you lose?";
  return <section className="report-page report-wizard" aria-labelledby="report-title">
    <button type="button" className="back" onClick={onBack}>← Back to browse</button>
    <div className="page-heading"><span className="eyebrow">Create a {draft.type} report</span><h1 id="report-title">{draft.type === "found" ? "Help it find its owner." : "Let’s find your item."}</h1>
      <p>Just three short steps. Your details stay here while you move between them.</p></div>
    {onTypeChange && <fieldset className="type-choice report-type-choice" disabled={busy || !!savedReport}>
      <legend>Which report do you want to make?</legend>
      <label className={draft.type === "lost" ? "selected" : ""}><input type="radio" name="reportType" checked={draft.type === "lost"} onChange={() => onTypeChange("lost")} /><span><b><span className="type-word">Lost</span> report</b><small>I lost something</small></span></label>
      <label className={draft.type === "found" ? "selected" : ""}><input type="radio" name="reportType" checked={draft.type === "found"} onChange={() => onTypeChange("found")} /><span><b><span className="type-word">Found</span> report</b><small>I found something</small></span></label>
    </fieldset>}
    <div className="wizard-progress" aria-label={`Step ${step} of 3`}><span>Step {step} of 3</span><div className="wizard-progress-track"><span style={{ width: `${step / 3 * 100}%` }} /></div><span>{step === 1 ? title : step === 2 ? "Where and when?" : "Review and post"}</span></div>
    {restored && <p className="notice" role="status">Your report draft was restored. {photoMissing && "Please reselect your photo before posting."}</p>}
    <form className="wizard-card" onSubmit={submit} aria-busy={busy} noValidate>
      {step === 1 && <div className="wizard-step"><span className="eyebrow">The item</span><h2>{title}</h2><p className="wizard-intro">{draft.type === "found" ? "Start with a photo if you have one, then add a few details that help someone recognize it." : "Describe what you remember. A photo can help, but you can post without one."}</p>
        {draft.type === "found" && <PhotoControl photoKey={photoKey} photoFile={photoFile} preview={preview} photoMissing={photoMissing} disabled={busy} onPhoto={selectPhoto} onRemove={removePhoto} />}
        <div className="form-grid"><label className="field">Item name<input maxLength={120} value={draft.name} onChange={event => update("name", event.target.value)} placeholder="Keys, black backpack, UCard…" aria-invalid={!!error && !draft.name.trim()} /></label>
          <label className="field">Category<select required value={draft.category} onChange={event => update("category", event.target.value)}><option value="">Choose a category…</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label></div>
        <label className="field">Description<textarea className="box" maxLength={3000} value={draft.description} onChange={event => update("description", event.target.value)} placeholder={draft.type === "found" ? "Color, brand, and where the owner can retrieve it" : "Color, brand, unique features, and when you last saw it"} aria-invalid={!!error && !draft.description.trim()} /></label>
        <p className="field-hint">Category is the current report classification. For found items, keep private proof details out of the public description.</p>
        {draft.type === "lost" && <PhotoControl photoKey={photoKey} photoFile={photoFile} preview={preview} photoMissing={photoMissing} disabled={busy} onPhoto={selectPhoto} onRemove={removePhoto} />}
      </div>}
      {step === 2 && <div className="wizard-step"><span className="eyebrow">The place and time</span><h2>{draft.type === "found" ? "Where and when did you find it?" : "Where and when did you last see it?"}</h2><p className="wizard-intro">Tap a campus pin, search a landmark, or enter a nearby place manually. Confirm your selection in the map panel.</p>
        <LocationPicker label={draft.type === "found" ? "Where did you find it?" : "Where did you lose it?"} value={draft.place} onChange={place => update("place", place)} disabled={busy} />
        <label className="field">{draft.type === "found" ? "Date and time found" : "Date and time last seen"} <span className="sub">(optional)</span><input type="datetime-local" value={draft.itemDate} onChange={event => update("itemDate", event.target.value)} /></label>
      </div>}
      {step === 3 && <div className="wizard-step"><span className="eyebrow">One last look</span><h2>Review your {draft.type} report</h2><p className="wizard-intro">Check the details before sharing them with the UMass community.</p>
        <div className="wizard-review"><div className="wizard-review-photo">{photoFile && preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Selected item preview" />
        ) : <span>{photoMissing ? "Photo needs to be reselected" : "No photo added"}</span>}</div>
          <dl><div><dt>Item</dt><dd>{draft.name}</dd></div><div><dt>Category</dt><dd>{draft.category}</dd></div><div><dt>Description</dt><dd>{draft.description}</dd></div><div><dt>Location</dt><dd>{draft.place}</dd></div><div><dt>Date and time</dt><dd>{draft.itemDate ? new Date(draft.itemDate).toLocaleString() : "Not provided"}</dd></div></dl></div>
        {savedReport && <div className="notice" role="status">The report is already saved. Only the photo upload needs attention; retrying will use this report.</div>}
        {photoMissing && <div className="wizard-reselect"><p>To add your original photo, select it again:</p><PhotoControl photoKey={photoKey} photoFile={photoFile} preview={preview} photoMissing={photoMissing} disabled={busy} onPhoto={selectPhoto} onRemove={removePhoto} /></div>}
        {guest && <p className="notice">You can prepare this draft as a guest. Sign in or create an account before posting; your text will remain in this tab.</p>}
      </div>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className="wizard-actions">
        {step > 1 && !savedReport && <button type="button" className="button button-secondary" onClick={() => goTo(previousStep(step))} disabled={busy}>Back</button>}
        {step < 3 ? <button type="button" className="button button-primary" onClick={continueStep} disabled={busy || validatingPhoto}>{validatingPhoto ? "Checking photo…" : "Continue →"}</button> : <>
          <button type="submit" className="button button-primary" disabled={busy || validatingPhoto || (!!savedReport && !photoFile)}>{busy ? "Saving report…" : savedReport ? photoFile ? "Retry photo upload" : "Reselect a photo to retry" : guest ? "Sign in to post" : `Post ${draft.type} report`}</button>
          {savedReport && <button type="button" className="button button-secondary" disabled={busy} onClick={() => finish(savedReport, false)}>Continue without photo</button>}
        </>}
      </div>
    </form>
  </section>;
}

function PhotoControl({ photoKey, photoFile, preview, photoMissing, disabled, onPhoto, onRemove }: {
  photoKey: number; photoFile: File | null; preview: string; photoMissing: boolean; disabled: boolean;
  onPhoto: (event: React.ChangeEvent<HTMLInputElement>) => void; onRemove: () => void;
}) {
  return <div className="wizard-photo"><div className="wizard-photo-preview">{photoFile && preview ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={preview} alt="Selected item preview" />
  ) : <span>{photoMissing ? "Reselect photo" : "Photo optional"}</span>}</div>
    <div className="wizard-photo-controls"><b>Add a photo</b><p>JPEG, PNG, or WebP · Up to 5 MiB</p><p className="photo-privacy-tip"><strong>Protect personal information:</strong> Before uploading, blur or cover names, ID numbers, card numbers, barcodes, and other sensitive details using your phone’s photo editor. Uploaded photos may appear in campus listings.</p><div className="wizard-photo-actions">
      <label className="button button-primary">Take photo<input key={`camera-${photoKey}`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={onPhoto} disabled={disabled} aria-label="Take item photo" /></label>
      <label className="button button-secondary">Upload photo<input key={`upload-${photoKey}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} disabled={disabled} aria-label="Upload item photo" /></label>
    </div>{photoFile && <button type="button" className="text-action" onClick={onRemove} disabled={disabled}>Remove {photoFile.name}</button>}</div>
  </div>;
}
