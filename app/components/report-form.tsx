"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LostSignalApi, saveReport, type Report } from "@/lib/frontend-api";
import { validateNewReport } from "@/lib/reports/validation";
import { validateImage } from "@/lib/reports/images";
import { LocationPicker } from "./campus-map/location-picker";

const api = new LostSignalApi();
const categories = ["Bags", "Keys", "IDs", "Tech", "Other"];
type ReportType = "lost" | "found";
type FormValues = { name: string; description: string; category: string; place: string };

export function ReportForm({ initialType, client, userId, onBack, onSaved, onReportCreated }: {
  initialType: ReportType;
  client: SupabaseClient;
  userId: string;
  onBack: () => void;
  onSaved: (report: Report, photoUploaded: boolean) => void;
  onReportCreated: () => void;
}) {
  const [type, setType] = useState<ReportType>(initialType);
  const [form, setForm] = useState<FormValues>({ name: "", description: "", category: "Bags", place: "" });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [savedReport, setSavedReport] = useState<Report | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [validatingPhoto, setValidatingPhoto] = useState(false);
  const posting = useRef(false);
  const photoSelection = useRef(0);

  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    const timer = setTimeout(() => setPreview(url), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [photoFile]);

  async function selectPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const sequence = ++photoSelection.current;
    if (!file) return;
    setError(""); setValidatingPhoto(true);
    try {
      const result = await validateImage(file);
      if (sequence !== photoSelection.current) return;
      if ("error" in result) { setError(result.error); event.target.value = ""; return; }
      setPreview(""); setPhotoFile(file);
    } catch (caught) {
      if (sequence === photoSelection.current) setError(caught instanceof Error ? caught.message : "Unable to check this photo.");
    } finally { if (sequence === photoSelection.current) setValidatingPhoto(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (posting.current || validatingPhoto) return;
    const validated = validateNewReport({ report_type: type, title: form.name, description: form.description, category: form.category, location: form.place });
    if (!validated.data) { setError(validated.error); return; }
    posting.current = true; setBusy(true); setError("");
    try {
      const { data, error: sessionError } = await client.auth.getUser();
      if (sessionError || data.user?.id !== userId) throw new Error("Your session has expired. Sign in again.");
      const result = await saveReport(api, validated.data, photoFile, savedReport);
      if (result.uploadError) {
        setSavedReport(result.report);
        setError(`Your report was saved, but the photo did not upload: ${result.uploadError}. Retry the photo below or continue without it.`);
        onReportCreated();
        return;
      }
      onSaved(result.report, Boolean(photoFile));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The report could not be saved. Please retry."); }
    finally { posting.current = false; setBusy(false); }
  }

  function setValue<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) {
    setForm(previous => ({ ...previous, [key]: value }));
    if (error && !savedReport) setError("");
  }

  return <section className="report-page" aria-labelledby="report-title">
    <button className="back" onClick={onBack}>← Back to browse</button>
    <div className="page-heading"><span className="eyebrow">Create a report</span><h1 id="report-title">{type === "lost" ? "I lost something" : "I found something"}</h1>
      <p>{type === "lost" ? "Tell us what went missing. Once your report is saved, you can compare it with found items." : "Share what you found so its owner has a way to find and claim it."}</p></div>
    <form className="report-form" onSubmit={submit} aria-busy={busy}>
      <div className="report-form-main">
        <section className="form-section"><div className="step-heading"><span>01</span><div><h2>What happened?</h2><p>Choose the report that best describes your situation.</p></div></div>
          <fieldset className="type-choice" disabled={busy || !!savedReport} aria-label="Report type">
            <label className={type === "lost" ? "selected" : ""}><input type="radio" name="reportType" checked={type === "lost"} onChange={() => setType("lost")} /><span><b>I lost something</b><small>Help me find my item</small></span></label>
            <label className={type === "found" ? "selected" : ""}><input type="radio" name="reportType" checked={type === "found"} onChange={() => setType("found")} /><span><b>I found something</b><small>Help return an item</small></span></label>
          </fieldset>
        </section>
        <section className="form-section"><div className="step-heading"><span>02</span><div><h2>Describe the item</h2><p>A few useful details make matches easier to recognize.</p></div></div>
          <fieldset disabled={busy || !!savedReport}>
            <div className="form-grid"><label className="field">Item name<input required maxLength={120} value={form.name} onChange={event => setValue("name", event.target.value)} placeholder="Black backpack" /></label>
              <label className="field">Category<select value={form.category} onChange={event => setValue("category", event.target.value)}>{categories.map(category => <option key={category}>{category}</option>)}</select></label></div>
            <label className="field">Description<textarea className="box" required maxLength={3000} value={form.description} onChange={event => setValue("description", event.target.value)} placeholder={type === "lost" ? "Color, brand, distinctive features, and when you last saw it" : "Color, brand, distinctive features, and where the owner can retrieve it"} /></label>
            <p className="field-hint">For found items, keep private identifying details out of the public description so the owner can use them as proof.</p>
          </fieldset>
        </section>
        <section className="form-section"><div className="step-heading"><span>03</span><div><h2>Pin the place</h2><p>Choose a campus landmark or enter a nearby location.</p></div></div>
          <LocationPicker label={type === "lost" ? "Where did you lose it?" : "Where did you find it?"} value={form.place} onChange={place => setValue("place", place)} disabled={busy || !!savedReport} />
        </section>
      </div>
      <aside className="report-form-side"><section className="form-section"><div className="step-heading"><span>04</span><div><h2>Add a photo</h2><p>Optional, but helpful for recognizing the item.</p></div></div>
        <label className="snap">{photoFile && preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Selected item preview" className="prev" />
        ) : <span><b>Choose or take a photo</b><small>JPEG, PNG, or WebP · Up to 5 MiB</small></span>}
          <input key={photoInputKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} disabled={busy} aria-label="Item photo" className="photo-input" />
        </label>
        {photoFile && <div className="photo-caption"><span>{photoFile.name}</span><button type="button" disabled={busy} onClick={() => { photoSelection.current++; setPhotoFile(null); setPreview(""); setPhotoInputKey(key => key + 1); }}>Remove</button></div>}
      </section>
      <div className="submit-panel"><h3>Ready to share?</h3><p>{type === "lost" ? "Your report can be compared with found items after posting." : "People browsing campus finds will be able to see your report."}</p>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <button className="button button-primary submit-button" disabled={busy || validatingPhoto || (!!savedReport && !photoFile)}>{busy ? "Saving report…" : validatingPhoto ? "Checking photo…" : savedReport ? photoFile ? "Retry photo upload" : "Choose a photo to retry" : `Post ${type} item`}</button>
        {savedReport && <button type="button" className="button button-secondary submit-button" disabled={busy} onClick={() => onSaved(savedReport, false)}>Continue without photo</button>}
      </div></aside>
    </form>
  </section>;
}
