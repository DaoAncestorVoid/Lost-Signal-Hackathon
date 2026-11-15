"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ReportPhoto } from "../report-photo";
import type { Report } from "@/lib/frontend-api";
import { CAMPUS_LOCATIONS, groupFoundReportsByLocation } from "@/lib/campus-locations";
import styles from "./campus-map.module.css";

const FoundReportsCanvas = dynamic(
  () => import("./campus-map-canvas").then(module => module.FoundReportsCanvas),
  { ssr: false, loading: () => <p className={styles.mapLoading} role="status">Loading campus map…</p> },
);

export function FoundReportsMap({ reports, onOpen, categories = ["All"], category = "All", onCategoryChange }: {
  reports: readonly Report[];
  onOpen: (report: Report) => void;
  categories?: readonly string[];
  category?: string;
  onCategoryChange?: (category: string) => void;
}) {
  const { groups, unmapped } = groupFoundReportsByLocation(reports);
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [showOther, setShowOther] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const selectedGroup = groups.find(group => group.location.id === selectedId);
  const selectedReport = selectedGroup?.reports.find(report => report.id === selectedReportId) ?? selectedGroup?.reports[0];
  const matches = locationQuery.trim() ? CAMPUS_LOCATIONS.filter(location =>
    [location.name, ...location.aliases].some(name => name.toLowerCase().includes(locationQuery.trim().toLowerCase()))) : [];

  function selectLocation(id: string) {
    setSelectedId(id); setSelectedReportId(null); setFocusId(id); setSheetOpen(true);
    setLocationQuery(""); setShowLocations(false);
  }

  return <div className={styles.mapExperience}>
    <div className={styles.mapStage}>
      <FoundReportsCanvas groups={groups} selectedId={selectedGroup ? selectedId : null} focusId={focusId} onSelect={selectLocation} />
      <div className={styles.mapTop}>
        <div className={styles.floatingSearch}>
          <span aria-hidden="true">⌕</span>
          <input type="search" aria-label="Search campus locations" placeholder="Search campus locations" value={locationQuery}
            onChange={event => setLocationQuery(event.target.value)} />
          {locationQuery && <button type="button" aria-label="Clear location search" onClick={() => setLocationQuery("")}>×</button>}
        </div>
        {locationQuery && <div className={styles.searchResults} role="listbox" aria-label="Campus location results">
          {matches.length ? matches.map(location => <button type="button" role="option" aria-selected={selectedId === location.id} key={location.id}
            onClick={() => selectLocation(location.id)}>{location.name}<span>{groups.find(group => group.location.id === location.id)?.reports.length ?? 0} items</span></button>) :
            <p>No listed landmark found. Manual report locations appear under Other locations.</p>}
        </div>}
        <div className={styles.filterRow} aria-label="Filter found items by category">
          {categories.map(option => <button type="button" key={option} aria-pressed={category === option}
            className={category === option ? styles.filterActive : ""} onClick={() => onCategoryChange?.(option)}>{option}</button>)}
        </div>
      </div>
      <div className={styles.mapCount} role="status">{reports.length} found item{reports.length === 1 ? "" : "s"} · {groups.length} mapped location{groups.length === 1 ? "" : "s"}</div>
      {!groups.length && <div className={styles.mapEmpty}>{unmapped.length ? "No reports with a mapped campus landmark match these filters." : "No open found items match these filters."}</div>}
      {focusId && !selectedGroup && <div className={styles.noLocationCard} role="status">
        <b>{CAMPUS_LOCATIONS.find(location => location.id === focusId)?.name}</b>
        <span>No open found items here match these filters.</span>
        <button type="button" onClick={() => { setFocusId(null); setSelectedId(null); }} aria-label="Dismiss location result">×</button>
      </div>}
      {selectedGroup && <section className={`${styles.bottomSheet} ${sheetOpen ? "" : styles.sheetCollapsed}`} aria-label={`Items at ${selectedGroup.location.name}`}>
        <button type="button" className={styles.sheetHandle} aria-expanded={sheetOpen} aria-label={sheetOpen ? "Collapse item details" : "Expand item details"}
          onClick={() => setSheetOpen(open => !open)}>
          <span />
        </button>
        <div className={styles.sheetHeading}><div><span className={styles.eyebrow}>{selectedGroup.reports.length} FOUND ITEM{selectedGroup.reports.length === 1 ? "" : "S"}</span>
          <h3>{selectedGroup.location.name}</h3></div><button type="button" aria-label="Close item details" onClick={() => setSelectedId(null)}>×</button></div>
        {sheetOpen && selectedReport && <>
          {selectedGroup.reports.length > 1 && <div className={styles.reportChoices} aria-label="Items at this location">
            {selectedGroup.reports.map(report => <button type="button" key={report.id} aria-pressed={selectedReport.id === report.id}
              onClick={() => setSelectedReportId(report.id)}>{report.title}</button>)}
          </div>}
          <div className={styles.sheetItem}>
            <ReportPhoto report={selectedReport} className={styles.sheetPhoto} />
            <div><span className={styles.eyebrow}>{selectedReport.category}</span><h4>{selectedReport.title}</h4><p>⌖ {selectedReport.location}</p>
              <button type="button" className={styles.detailsButton} onClick={() => onOpen(selectedReport)}>View details <span aria-hidden="true">→</span></button></div>
          </div>
        </>}
      </section>}
      <div className={styles.mapSecondary}>
        <button type="button" onClick={() => setShowLocations(open => !open)} aria-expanded={showLocations}>All mapped locations · {groups.length}</button>
        {unmapped.length > 0 && <button type="button" onClick={() => setShowOther(open => !open)} aria-expanded={showOther}>Other locations · {unmapped.length}</button>}
      </div>
    </div>
    {(showLocations || showOther) && <div className={styles.mapLists}>
      {showLocations && <section><h3>Mapped locations</h3>{groups.map(({ location, reports: items }) => <button type="button" key={location.id} onClick={() => selectLocation(location.id)}>{location.name}<span>{items.length} item{items.length === 1 ? "" : "s"}</span></button>)}</section>}
      {showOther && <section><h3>Other locations</h3><p>These reports have manually entered locations, so they have no map pin.</p>
        {unmapped.map(report => <button type="button" key={report.id} onClick={() => onOpen(report)}>{report.title}<span>{report.location}</span></button>)}</section>}
    </div>}
  </div>;
}
