"use client";

import type { Report } from "@/lib/frontend-api";
import { FoundReportsMap } from "./campus-map/found-reports-map";
import { ReportGrid } from "./report-card";

type BrowseViewProps = {
  reports: Report[];
  loading: boolean;
  error: string;
  query: string;
  category: string;
  categories: string[];
  mode: "list" | "map";
  onQuery: (value: string) => void;
  onCategory: (value: string) => void;
  onMode: (value: "list" | "map") => void;
  onOpen: (report: Report) => void;
  onLost: () => void;
  onFound: () => void;
  onMatches: () => void;
  onRetry: () => void;
};

export function BrowseView({ reports, loading, error, query, category, categories, mode,
  onQuery, onCategory, onMode, onOpen, onLost, onFound, onMatches, onRetry }: BrowseViewProps) {
  return <section className="browse-view" aria-labelledby="browse-title">
    <div className="landing-hero">
      <div className="hero-copy">
        <span className="eyebrow">UMass Amherst · Lost & found</span>
        <h1 id="browse-title">Let&apos;s get it back.</h1>
        <p>One place to report what you lost, share what you found, and reconnect the right item with the right person.</p>
        <div className="hero-actions">
          <button className="button button-primary" onClick={onLost}><span className="action-symbol" aria-hidden="true">⌕</span>I Lost Something <span aria-hidden="true">→</span></button>
          <button className="button button-light" onClick={onFound}><span className="action-symbol" aria-hidden="true">＋</span>I Found Something <span aria-hidden="true">→</span></button>
        </div>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-center">LS<span>●</span></div><span className="hero-coordinate">42.3868° N · 72.5301° W</span></div>
    </div>

    <div className="browse-section-head">
      <div><span className="eyebrow">Explore campus finds</span><h2>Recently found</h2><p>Search reports or explore where items were found.</p></div>
      <button className="text-action" onClick={onMatches}>Find possible matches <span aria-hidden="true">↗</span></button>
    </div>
    <div className="browse-toolbar">
      <label className="search-field"><span className="sr-only">Search found items</span><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => onQuery(event.target.value)} placeholder="Search items, places, or details" /></label>
      <div className="view-switch" role="group" aria-label="Browse view">
        <button type="button" aria-pressed={mode === "list"} onClick={() => onMode("list")}>Grid</button>
        <button type="button" aria-pressed={mode === "map"} onClick={() => onMode("map")}>Map</button>
      </div>
    </div>
    {mode === "list" && <div className="cats" aria-label="Filter by category">{categories.map(option => <button key={option} className={`cat ${category === option ? "on" : ""}`} aria-pressed={category === option} onClick={() => onCategory(option)}>{option}</button>)}</div>}
    <div className="results-heading"><span>{loading ? "Loading finds…" : `${reports.length} ${reports.length === 1 ? "item" : "items"} found`}</span><button className="text-action" disabled={loading} onClick={onRetry}>Refresh</button></div>
    {mode === "map" && !loading && !error ? <FoundReportsMap reports={reports} onOpen={onOpen} categories={categories} category={category} onCategoryChange={onCategory} /> :
      <ReportGrid reports={reports} loading={loading} error={error} onRetry={onRetry} onOpen={onOpen} />}
  </section>;
}
