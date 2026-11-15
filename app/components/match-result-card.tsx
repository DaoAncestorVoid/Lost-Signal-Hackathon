"use client";

import type { CSSProperties } from "react";
import type { RankedReport, Report } from "@/lib/frontend-api";
import { ReportPhoto } from "./report-photo";

function scoreLevel(score: number) {
  if (score >= 75) return { label: "Strong match", tone: "strong" };
  if (score >= 50) return { label: "Possible match", tone: "possible" };
  return { label: "Weak match", tone: "weak" };
}

export function MatchResultCard({ match, onOpen }: { match: RankedReport; onOpen: (report: Report) => void }) {
  const { report, score, reasons } = match;
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const level = scoreLevel(pct);
  return <article className="match-card">
    <ReportPhoto report={report} className="match-photo" />
    <div className="match-content">
      <div className="match-topline">
        <div className="tags"><span className={"tag" + (report.report_type === "found" ? "" : " tag-neutral")}>{report.report_type === "found" ? "Found" : "Lost"}</span><span className="tag tag-neutral">{report.category}</span></div>
        <div className={"score " + level.tone} aria-label={`${pct}% similarity score, ${level.label.toLowerCase()}`}>
          <span className="score-ring" style={{ "--score": pct } as CSSProperties}><b>{pct}<small>%</small></b></span>
          <span className="score-label">{level.label}</span>
        </div>
      </div>
      <h3>{report.title}</h3>
      <p className="match-location"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>{report.location}</p>
      {report.item_date && <p className="match-event-time">{report.report_type === "found" ? "Found" : "Lost"} {new Date(report.item_date).toLocaleString()}</p>}
      <div className="match-reasons"><b>Why this matched</b>
        {reasons.length ? <ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p>No explanation was provided for this ranking.</p>}
      </div>
      <button className="button button-secondary" onClick={() => onOpen(report)}>View report and next steps <span aria-hidden="true">→</span></button>
    </div>
  </article>;
}
