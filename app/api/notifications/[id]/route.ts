import { createClient } from "@/lib/supabase/server";
import { canWriteAsPermanentUser, permanentAccountRequired } from "@/lib/guest-permissions";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!canWriteAsPermanentUser(user)) return permanentAccountRequired();
  const { id } = await params;
  if (!uuidPattern.test(id)) return Response.json({ error: "Invalid notification id" }, { status: 400 });
  const result = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("recipient_id", user.id).select("id").maybeSingle();
  if (result.error) return Response.json({ error: "Unable to mark notification read" }, { status: 500 });
  if (!result.data) return Response.json({ error: "Notification not found" }, { status: 404 });
  return Response.json({ id });
}
