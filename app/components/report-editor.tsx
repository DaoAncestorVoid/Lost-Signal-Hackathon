"use client";

import { useState } from "react";
import type { Report } from "@/lib/frontend-api";
import { LostSignalApi } from "@/lib/frontend-api";
import { validateReportEdit } from "@/lib/reports/validation";
import { validateImage } from "@/lib/reports/images";
import { LocationPicker } from "./campus-map/location-picker";
import { ReportPhoto } from "./report-photo";

const api = new LostSignalApi();
const categories = ["Bags", "Keys", "IDs", "Tech", "Other"];
function localDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ReportEditor({ report, onBack, onChanged, onDone }: { report: Report; onBack: () => void; onChanged: () => void; onDone: (notice: string) => void }) {
  const [title, setTitle] = useState(report.title);
  const [description, setDescription] = useState(report.description);
  const [category, setCategory] = useState(report.category);
  const [location, setLocation] = useState(report.location);
  const [itemDate, setItemDate] = useState(() => localDate(report.item_date));
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (itemDate && Number.isNaN(new Date(itemDate).getTime())) { setError("Enter a valid date and time."); return; }
    const payload = { title, description, category, location, item_date: itemDate ? new Date(itemDate).toISOString() : null };
    const validation = validateReportEdit(payload);
    if (!validation.data) { setError(validation.error); return; }
    if (photo) {
      const checked = await validateImage(photo);
      if ("error" in checked) { setError(checked.error); return; }
    }
    setBusy(true); setError("");
    let detailsSaved = false;
    try {
      await api.updateReport(report.id, validation.data);
      detailsSaved = true;
      let warning: string | undefined;
      if (photo) warning = await api.uploadPhoto(report.id, photo);
      else if (removePhoto && report.image_path) warning = await api.removePhoto(report.id);
      onDone(warning ?? "Report updated.");
    } catch (caught) {
      if (detailsSaved) onChanged();
      setError(`${detailsSaved ? "Details saved, but the photo change failed. " : ""}${caught instanceof Error ? caught.message : "Please try again."}`);
    } finally { setBusy(false); }
  }
  return <section className="report-page report-editor"><button type="button" className="back" onClick={onBack}>← My activity</button>
    <div className="page-heading"><span className="eyebrow">Manage your {report.report_type} report</span><h1>Edit report</h1><p>Update the details people use to recognize this item.</p></div>
    <form className="wizard-card" onSubmit={save} aria-busy={busy}>
      <div className="form-grid"><label className="field">Item name<input value={title} maxLength={120} onChange={event => setTitle(event.target.value)} required /></label>
        <label className="field">Category<select value={category} onChange={event => setCategory(event.target.value)}>{[...new Set([...categories, report.category])].map(value => <option key={value}>{value}</option>)}</select></label></div>
      <label className="field">Description<textarea className="box" value={description} maxLength={3000} onChange={event => setDescription(event.target.value)} required /></label>
      <LocationPicker label="Report location" value={location} onChange={setLocation} disabled={busy} />
      <label className="field">{report.report_type === "found" ? "Date and time found" : "Date and time last seen"} <span className="sub">(optional)</span><input type="datetime-local" value={itemDate} onChange={event => setItemDate(event.target.value)} /></label>
      <div className="edit-photo"><h2>Photo</h2>{report.image_path && !removePhoto && !photo && <ReportPhoto report={report} className="edit-photo-preview" />}
        <label className="field">{report.image_path ? "Replace photo" : "Add photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setPhoto(event.target.files?.[0] ?? null); setRemovePhoto(false); }} /></label>
        {photo && <p className="field-hint">Selected: {photo.name}</p>}
        {report.image_path && <label className="edit-photo-remove"><input type="checkbox" checked={removePhoto} onChange={event => { setRemovePhoto(event.target.checked); if (event.target.checked) setPhoto(null); }} /> Remove current photo</label>}
      </div>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className="wizard-actions"><button className="button button-secondary" type="button" onClick={onBack} disabled={busy}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
    </form>
  </section>;
}
