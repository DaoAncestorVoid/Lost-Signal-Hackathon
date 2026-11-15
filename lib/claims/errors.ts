export function claimErrorResponse(code: string | undefined, action: "submit" | "decide" | "confirm") {
  if (code === "P0002") {
    return Response.json({ error: "Claim or report not found" }, { status: 404 });
  }
  if (code === "42501") {
    return Response.json({ error: "Not allowed to perform this action" }, { status: 403 });
  }
  if (code === "23505") {
    const message = action === "submit" ? "A claim already exists" : "Another claim is already approved";
    return Response.json({ error: message }, { status: 409 });
  }
  if (code === "23514") {
    return Response.json({ error: "Claim or report is not eligible" }, { status: 409 });
  }
  if (code === "22023") {
    return Response.json({ error: "Invalid claim input" }, { status: 400 });
  }
  return Response.json({ error: `Unable to ${action} claim` }, { status: 500 });
}
