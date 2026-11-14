import {
  isReportImagePath,
  REPORT_IMAGE_BUCKET,
  SIGNED_URL_SECONDS,
  validateImage,
} from "@/lib/reports/images";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return Response.json({ error: "Invalid report id" }, { status: 400 });
  }

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id,user_id,image_path")
    .eq("id", id)
    .maybeSingle();
  if (reportError) {
    return Response.json({ error: "Unable to load report" }, { status: 500 });
  }
  if (!report || report.user_id !== user.id) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    return Response.json({ error: "Content-Type must be multipart/form-data" }, { status: 415 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form" }, { status: 400 });
  }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== "image" || !(entries[0][1] instanceof File)) {
    return Response.json({ error: "Provide one image file in the image field" }, { status: 400 });
  }

  const image = await validateImage(entries[0][1]);
  if ("error" in image) {
    return Response.json({ error: image.error }, { status: 400 });
  }

  const path = `${user.id}/${id}/${crypto.randomUUID()}.${image.extension}`;
  const storage = supabase.storage.from(REPORT_IMAGE_BUCKET);
  const { error: uploadError } = await storage.upload(path, image.bytes, {
    contentType: image.contentType,
    upsert: false,
  });
  if (uploadError) {
    return Response.json({ error: "Unable to upload image" }, { status: 500 });
  }

  const { data: signed, error: signError } = await storage.createSignedUrl(path, SIGNED_URL_SECONDS);
  if (signError || !signed) {
    await storage.remove([path]);
    return Response.json({ error: "Unable to sign image URL" }, { status: 500 });
  }

  let update = supabase.from("reports").update({ image_path: path }).eq("id", id).eq("user_id", user.id);
  update = report.image_path === null ? update.is("image_path", null) : update.eq("image_path", report.image_path);
  const { data: updated, error: updateError } = await update.select("id,image_path").maybeSingle();
  if (updateError || !updated) {
    await storage.remove([path]);
    return Response.json({ error: "Unable to save image path" }, { status: updateError ? 500 : 409 });
  }

  if (report.image_path && isReportImagePath(report.image_path, user.id, id)) {
    await storage.remove([report.image_path]);
  }

  return Response.json(
    { image_path: path, signed_url: signed.signedUrl, expires_in: SIGNED_URL_SECONDS },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(_request: Request, { params }: Context) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return Response.json({ error: "Invalid report id" }, { status: 400 });
  }

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("user_id,image_path")
    .eq("id", id)
    .maybeSingle();
  if (reportError) {
    return Response.json({ error: "Unable to load report" }, { status: 500 });
  }
  if (!report || !report.image_path || !isReportImagePath(report.image_path, report.user_id, id)) {
    return Response.json({ error: "Image not found" }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(REPORT_IMAGE_BUCKET)
    .createSignedUrl(report.image_path, SIGNED_URL_SECONDS);
  if (signError || !signed) {
    return Response.json({ error: "Unable to sign image URL" }, { status: 500 });
  }

  return Response.json(
    { image_path: report.image_path, signed_url: signed.signedUrl, expires_in: SIGNED_URL_SECONDS },
    { headers: { "Cache-Control": "no-store" } },
  );
}
