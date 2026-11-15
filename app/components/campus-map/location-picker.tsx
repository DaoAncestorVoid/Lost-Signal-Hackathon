"use client";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { CAMPUS_LOCATIONS, findCampusLocation, locationNameForSelection } from "@/lib/campus-locations";
import styles from "./campus-map.module.css";

const LocationPickerCanvas = dynamic(
  () => import("./campus-map-canvas").then(module => module.LocationPickerCanvas),
  { ssr: false, loading: () => <p className={styles.mapLoading} role="status">Loading campus map…</p> },
);

export function LocationPicker({ value, onChange, label, disabled = false }: {
  value: string;
  onChange: (name: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState("");
  const selected = findCampusLocation(draft);
  const filtered = CAMPUS_LOCATIONS.filter(location =>
    !query.trim() || [location.name, ...location.aliases].some(name => name.toLowerCase().includes(query.trim().toLowerCase())) || location.id === selected?.id);
  const confirmed = (selected?.name ?? draft.trim()) === value.trim() && !!value.trim();

  return <div className={styles.picker}>
    <div className={styles.pickerHeading}><span className={styles.eyebrow}>REPORT LOCATION</span><h3>Choose a campus spot</h3>
      <p>Tap a building pin or search the campus list. You can also enter a location manually.</p></div>
    <div className={styles.pickerSearch}>
      <label htmlFor={`${id}-search`}>Search buildings</label>
      <input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Library, Student Union, ILC…" disabled={disabled} />
      <label htmlFor={`${id}-select`}>Campus landmark</label>
      <select id={`${id}-select`} value={selected?.id ?? "other"} disabled={disabled}
        onChange={event => setDraft(locationNameForSelection(event.target.value))}>
        <option value="other">Other / manual location</option>
        {filtered.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
      </select>
      {query && filtered.length === 0 && <p className={styles.pickerHint}>No listed landmark matches. Choose Other and enter a location below.</p>}
    </div>
    <div className={styles.pickerMapWrap}><LocationPickerCanvas selectedId={selected?.id ?? null} disabled={disabled} onSelect={setDraft} /></div>
    <div className={styles.confirmPanel}>
      <div><span className={styles.eyebrow}>{selected ? "SELECTED LANDMARK" : "MANUAL LOCATION"}</span>
        <h4>{draft.trim() || "Select a location"}</h4></div>
      <label htmlFor={`${id}-manual`}>{label}</label>
      <input id={`${id}-manual`} className={styles.manualInput} maxLength={200} value={draft} disabled={disabled}
        onChange={event => setDraft(event.target.value)} placeholder="Building or nearby campus spot" />
      <button type="button" className={styles.confirmButton} disabled={disabled || !draft.trim() || confirmed}
        onClick={() => onChange(selected?.name ?? draft.trim())}>{confirmed ? "Location confirmed" : "Confirm location"}</button>
      {!confirmed && value && <p className={styles.pickerHint}>Your last confirmed location remains saved until you confirm this choice.</p>}
    </div>
  </div>;
}
