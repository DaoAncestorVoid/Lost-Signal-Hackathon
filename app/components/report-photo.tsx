"use client";

import { useEffect, useState } from "react";
import { LostSignalApi, type Report } from "@/lib/frontend-api";
const api = new LostSignalApi();

export function ReportPhoto({ report, className }: { report: Report; className: string }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!report.image_path) return;
    const controller = new AbortController();
    async function load() {
      try {
        const signed = await api.photoUrl(report.id, controller.signal);
        if (!controller.signal.aborted) { setUrl(signed); setFailed(false); }
      } catch { if (!controller.signal.aborted) setFailed(true); }
    }
    void load();
    const timer = setInterval(() => void load(), 240_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [report.id, report.image_path]);
  return url && !failed ? (
    // Signed URLs expire and are renewed; native images avoid caching private photos.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={url} alt={report.title} onError={() => setFailed(true)} />
  ) : <div className={className} style={{ background: "var(--p1)" }}>
    {!report.image_path ? "No photo" : failed ? "Photo unavailable" : "Loading photo…"}
  </div>;
}
