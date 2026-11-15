import { createClient } from "@/lib/supabase/server";
import { canWriteAsPermanentUser, permanentAccountRequired } from "@/lib/guest-permissions";
import { isUuid } from "@/lib/claims/validation";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: "Authentication required" }, { status: 401, headers });
  if (!canWriteAsPermanentUser(user)) return permanentAccountRequired();
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Invalid notification id" }, { status: 400, headers });

  const result = await supabase.from("activity_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id).eq("recipient_id", user.id)
    .select("id").maybeSingle();
  if (result.error) return Response.json({ error: "Unable to mark notification read" }, { status: 500, headers });
  if (!result.data) return Response.json({ error: "Notification not found" }, { status: 404, headers });
  return Response.json({ id }, { headers });
}
