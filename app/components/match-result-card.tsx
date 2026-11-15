"use client";

import type { RankedReport, Report } from "@/lib/frontend-api";
import { ReportPhoto } from "./report-photo";

export function MatchResultCard({ match, onOpen }: { match: RankedReport; onOpen: (report: Report) => void }) {
  const { report, score, reasons } = match;
  return <article className="match-card">
    <ReportPhoto report={report} className="match-photo" />
    <div className="match-content">
      <div className="match-topline"><span className="eyebrow">{report.report_type === "found" ? "Found report" : "Lost report"}</span><span className="similarity"><b>{score}%</b> similarity score</span></div>
      <h3>{report.title}</h3><p className="match-location">{report.location}</p>
      <div className="match-reasons"><b>Why this matched</b><p>{reasons.length ? reasons.join(" · ") : "No explanation was provided for this ranking."}</p></div>
      <button className="button button-secondary" onClick={() => onOpen(report)}>View report and next steps <span aria-hidden="true">→</span></button>
    </div>
  </article>;
}
