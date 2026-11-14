import { validateNewReport } from "@/lib/reports/validation";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = validateNewReport(body);
  if (result.error) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const { data: report, error } = await supabase
    .from("reports")
    .insert({ ...result.data, user_id: user.id })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: "Unable to create report" }, { status: 500 });
  }

  return Response.json({ report }, { status: 201 });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: reports, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: "Unable to load reports" }, { status: 500 });
  }

  return Response.json({ reports });
}
