import type { Claim } from "@/lib/frontend-api";

type Props = {
  claim: Pick<Claim, "status" | "handoff_confirmed_at">;
  perspective: "finder" | "claimant";
  compact?: boolean;
};

/** Small, glanceable status with an optional explanation of the full return flow. */
export function ReturnJourney({ claim, perspective, compact = false }: Props) {
  const complete = Boolean(claim.handoff_confirmed_at);
  const declined = claim.status === "rejected";
  const approved = claim.status === "approved";
  const stage = complete ? 4 : approved ? 3 : 2;
  const status = complete ? "Returned" : declined ? "Declined" : approved ? "Ready for pickup" : "Awaiting review";
  const tone = complete ? "complete" : declined ? "declined" : approved ? "in-progress" : "waiting";

  const next = complete
    ? "Item returned and confirmed."
    : declined
      ? "This request was declined."
      : approved
        ? perspective === "claimant"
          ? "Arrange pickup, then confirm when you have the item."
          : "Arrange pickup. The recipient confirms the return."
        : perspective === "claimant"
          ? "Waiting for the finder to review your request."
          : "Review the ownership proof and make a decision.";

  return <div className={"return-summary" + (compact ? " return-summary-compact" : "")}>
    <div className="return-summary-head">
      <span className={`return-status return-status-${tone}`}>
        <span className="return-status-dot" aria-hidden="true"/>
        {status}
      </span>
      {!declined && <span className="return-progress-text">{stage} of 4</span>}
    </div>
    {!compact && !declined && <div className="return-progress-track" aria-label={`Return progress: ${stage} of 4 stages`}>
      {[1, 2, 3, 4].map(step => <span key={step} className={step <= stage ? "filled" : ""}/>)}
    </div>}
    <p className="return-summary-next">{next}</p>
    {!compact && <details className="return-explainer">
      <summary>How item returns work</summary>
      <ol>
        <li>Someone submits a private ownership request.</li>
        <li>The finder reviews and approves or declines it.</li>
        <li>Both students arrange a safe pickup through Messages.</li>
        <li>The recipient confirms receiving the item. The finder earns 50 Karma points.</li>
      </ol>
    </details>}
  </div>;
}
