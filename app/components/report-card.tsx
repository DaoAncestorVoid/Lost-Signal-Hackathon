"use client";

import type { Report } from "@/lib/frontend-api";
import { ReportPhoto } from "./report-photo";

export function ReportCard({ report, onOpen }: { report: Report; onOpen: (report: Report) => void }) {
  return <button className="card" onClick={() => onOpen(report)}>
    <ReportPhoto report={report} className="ph" />
    <div className="t"><b>{report.title}</b><span>{report.location}</span></div>
  </button>;
}

export function ReportGrid({ reports, loading, error, onRetry, onOpen }: {
  reports: Report[]; loading: boolean; error: string;
  onRetry: () => void; onOpen: (report: Report) => void;
}) {
  if (loading) return <p role="status">Loading reports…</p>;
  if (error) return <p className="err" role="alert">{error} <button className="small" onClick={onRetry}>Retry reports</button></p>;
  if (!reports.length) return <p className="empty">No open found reports match your search.</p>;
  return <div className="grid">{reports.map(report => <ReportCard key={report.id} report={report} onOpen={onOpen} />)}</div>;
}
