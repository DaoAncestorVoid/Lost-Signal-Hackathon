import type { Claim } from "@/lib/frontend-api";

type Props = { claim: Pick<Claim, "status" | "handoff_confirmed_at">; perspective: "finder" | "claimant"; compact?: boolean };

export function ReturnJourney({ claim, perspective, compact = false }: Props) {
  const done = Boolean(claim.handoff_confirmed_at);
  const rejected = claim.status === "rejected";
  const approved = claim.status === "approved";
  const current = done ? 4 : rejected ? 2 : approved ? 3 : 2;
  const description = rejected
    ? perspective === "claimant"
      ? "This claim was declined. Check other listings or contact the finder if you need clarification."
      : "You declined this claim. Other eligible requests can still be reviewed."
    : done
      ? "Item received and return confirmed. The finder earns 50 Campus Karma points."
      : approved
        ? perspective === "claimant"
          ? "Your claim was approved. Message the finder to arrange pickup. After you physically receive the item, select “I received this item.”"
          : "You approved ownership. Message the claimant to arrange a safe handoff. The claimant confirms receipt afterward; that's when you earn Karma."
        : perspective === "claimant"
          ? "Your request was sent. The finder will review your private proof. You can message them while you wait."
          : "A student requested this item. Review their private proof and approve or decline the request.";

  return <div className={"return-journey" + (compact ? " return-journey-compact" : "")} aria-label="Item return progress">
    <ol className="return-steps">
      {["Claim sent", "Ownership reviewed", "Arrange pickup", "Return confirmed"].map((label, index) =>
        <li key={label} className={rejected && index > 1 ? "future" : index + 1 < current ? "done" : index + 1 === current ? "current" : "future"}>
          <span className="return-step-number" aria-hidden="true">{index + 1 < current || (done && index === 3) ? "✓" : index + 1}</span>
          <span>{label}</span>
        </li>
      )}
    </ol>
    <p className="return-guidance">{rejected ? "Claim declined. " : done ? "Return completed. " : "Next step: "}{description}</p>
    {!compact && <p className="return-footnote">Only the person receiving the item can confirm the handoff. Approval alone does not earn Karma.</p>}
  </div>;
}
