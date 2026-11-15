"use client";

import { useEffect, useState } from "react";

type Badge = {
  id: string;
  label: string;
  emoji: string;
  threshold: number;
  unlocked: boolean;
};
type KarmaSummary = {
  approvedClaims: number;
  points: number;
  badges: Badge[];
  nextBadge: { id: string; label: string; threshold: number; remaining: number } | null;
};

function isKarmaSummary(value: unknown): value is KarmaSummary {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<KarmaSummary>;
  return Number.isSafeInteger(data.approvedClaims)
    && typeof data.approvedClaims === "number"
    && data.approvedClaims >= 0
    && Number.isSafeInteger(data.points)
    && typeof data.points === "number"
    && data.points >= 0
    && Array.isArray(data.badges)
    && data.badges.every(b => b && typeof b.id === "string"
      && typeof b.label === "string" && typeof b.emoji === "string"
      && typeof b.threshold === "number" && typeof b.unlocked === "boolean")
    && (data.nextBadge === null || (data.nextBadge !== undefined
      && typeof data.nextBadge.label === "string"
      && typeof data.nextBadge.remaining === "number"
      && typeof data.nextBadge.threshold === "number"));
}

/** Portable profile section: can be moved to a redesigned Profile tab later. */
export function KarmaPanel({ enabled, refreshKey = 0 }: { enabled: boolean; refreshKey?: number }) {
  const [karma, setKarma] = useState<KarmaSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/karma", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok || !isKarmaSummary(payload)) throw new Error("Unable to load your achievements");
        if (!controller.signal.aborted) setKarma(payload);
      } catch {
        if (!controller.signal.aborted) setError("Unable to load Campus Karma. Please retry later.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [enabled, refreshKey]);

  if (!enabled) return null;
  return <section className="karma-panel" aria-labelledby="karma-heading">
    <h2 id="karma-heading">🏆 Campus Karma</h2>
    <p className="note">Earn 50 points each time you approve a valid ownership claim on a found item. Approval does not necessarily mean the item has been physically returned.</p>
    {loading && <p role="status">Loading achievements…</p>}
    {error && <p className="err" role="alert">{error}</p>}
    {karma && !loading && <>
      <div className="karma-stats">
        <div className="karma-stat"><strong>{karma.points}</strong><span>Karma points</span></div>
        <div className="karma-stat"><strong>{karma.approvedClaims}</strong><span>Approved claims</span></div>
      </div>
      <div className="karma-badges" aria-label="Karma achievements">
        {karma.badges.map(badge => <div className={"karma-badge" + (badge.unlocked ? " unlocked" : "")} key={badge.id}>
          <span aria-hidden="true">{badge.unlocked ? badge.emoji : "🔒"}</span>
          <strong>{badge.label}</strong>
          <small>{badge.threshold} approved {badge.threshold === 1 ? "claim" : "claims"}</small>
        </div>)}
      </div>
      <p className="note" aria-live="polite">
        {karma.nextBadge
          ? `${karma.nextBadge.remaining} more ${karma.nextBadge.remaining === 1 ? "approval" : "approvals"} until ${karma.nextBadge.label}!`
          : "All Campus Karma badges unlocked!"}
      </p>
    </>}
  </section>;
}
