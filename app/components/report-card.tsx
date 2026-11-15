"use client";

import type { Report } from "@/lib/frontend-api";
import { ReportPhoto } from "./report-photo";

export function ReportCard({ report, onOpen }: { report: Report; onOpen: (report: Report) => void }) {
  return <button className="card report-card" onClick={() => onOpen(report)} aria-label={`View ${report.title} at ${report.location}`}>
    <div className="card-media"><ReportPhoto report={report} className="ph" /><span className="card-type">Found item</span></div>
    <div className="card-body">
      {report.category && <span className="card-category">{report.category}</span>}
      <b>{report.title}</b>
      <span className="card-location">{report.location}</span>
      <span className="card-link">View item <span aria-hidden="true">↗</span></span>
    </div>
  </button>;
}

export function ReportGrid({ reports, loading, error, onRetry, onOpen }: {
  reports: Report[]; loading: boolean; error: string;
  onRetry: () => void; onOpen: (report: Report) => void;
}) {
  if (loading) return <div className="state-card" role="status"><span className="spinner" />Loading reports…</div>;
  if (error) return <div className="state-card state-error" role="alert"><b>Reports could not load</b><p>{error}</p><button className="small" onClick={onRetry}>Retry reports</button></div>;
  if (!reports.length) return <div className="state-card"><b>Nothing here yet</b><p>No open found reports match your search. Try another category or check back soon.</p></div>;
  return <div className="grid">{reports.map(report => <ReportCard key={report.id} report={report} onOpen={onOpen} />)}</div>;
}
