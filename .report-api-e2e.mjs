import nextEnv from "@next/env";
import { createServerClient } from "@supabase/ssr";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const cookies = new Map();
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values) => {
        for (const { name, value } of values) cookies.set(name, value);
      },
    },
  },
);

const base = process.env.REPORTS_API_BASE_URL || "http://localhost:3100";

function cookieHeader() {
  return [...cookies]
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("; ");
}

async function api(path, options = {}, authenticated = true) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      ...(authenticated ? { Cookie: cookieHeader() } : {}),
      ...options.headers,
    },
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function main() {
  const unauthenticatedList = await api("/api/reports", {}, false);
  const unauthenticatedPost = await api("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_type: "lost", title: "No session", description: "Test", location: "Test" }),
  }, false);
  console.log("unauthorized GET/POST:", unauthenticatedList.status, unauthenticatedPost.status);

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user || !data.session) {
    console.log("anonymous sign-in failed:", error?.code || error?.message || "missing session");
    process.exitCode = 2;
    return;
  }
  console.log("anonymous sign-in:", data.user.is_anonymous === true ? "confirmed" : "session created");

  const sample = {
    report_type: "lost",
    title: `LostSignal API smoke test ${new Date().toISOString()}`,
    description: "Temporary test report with no image",
    location: "HackUMass demo test",
  };
  const created = await api("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sample),
  });
  console.log("POST status:", created.status);
  if (created.status !== 201 || !created.body.report?.id) {
    console.log("POST error:", created.body.error || "unexpected response");
    return;
  }

  const report = created.body.report;
  console.log("created report id:", report.id);
  console.log("owner and no-image verified:", report.user_id === data.user.id, report.image_path === null);

  const { data: databaseRow, error: databaseError } = await supabase
    .from("reports")
    .select("id,user_id,report_type,title,image_path")
    .eq("id", report.id)
    .single();
  console.log("RLS-protected database read:", !databaseError && databaseRow?.id === report.id && databaseRow?.user_id === data.user.id);
  if (databaseError) console.log("database read error:", databaseError.code);

  const list = await api("/api/reports");
  console.log("GET list status and includes report:", list.status, Array.isArray(list.body.reports) && list.body.reports.some((row) => row.id === report.id));

  const detail = await api(`/api/reports/${report.id}`);
  console.log("GET detail status and id matches:", detail.status, detail.body.report?.id === report.id);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9F1b8AAAAASUVORK5CYII=",
    "base64",
  );
  const imageForm = new FormData();
  imageForm.set("image", new File([png], "sample.png", { type: "image/png" }));
  const upload = await api(`/api/reports/${report.id}/image`, { method: "POST", body: imageForm });
  console.log("image POST status:", upload.status);
  if (upload.status !== 201 || !upload.body.signed_url) {
    console.log("image POST error:", upload.body.error || "unexpected response");
    process.exitCode = 2;
    return;
  }
  const { data: uploadedRow, error: imageReadError } = await supabase
    .from("reports")
    .select("image_path")
    .eq("id", report.id)
    .single();
  console.log("database image path matches:", !imageReadError && uploadedRow?.image_path === upload.body.image_path);

  const signedResponse = await fetch(upload.body.signed_url);
  const downloaded = Buffer.from(await signedResponse.arrayBuffer());
  console.log("signed image fetch status and bytes match:", signedResponse.status, downloaded.equals(png));
  const refreshed = await api(`/api/reports/${report.id}/image`);
  console.log("image GET status and URL:", refreshed.status, Boolean(refreshed.body.signed_url));

  const badImageForm = new FormData();
  badImageForm.set("image", new File(["not a PNG"], "fake.png", { type: "image/png" }));
  const badImage = await api(`/api/reports/${report.id}/image`, { method: "POST", body: badImageForm });
  console.log("invalid image status:", badImage.status);
  const unauthenticatedImage = await api(`/api/reports/${report.id}/image`, {}, false);
  console.log("unauthorized image GET status:", unauthenticatedImage.status);

  const invalid = await api("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_type: "lost", description: "Missing title", location: "Test" }),
  });
  console.log("invalid POST status:", invalid.status);

  const spoofed = await api("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sample, user_id: "00000000-0000-4000-8000-000000000000" }),
  });
  console.log("spoofed owner POST status:", spoofed.status);

  const invalidId = await api("/api/reports/not-a-uuid");
  const unauthenticatedDetail = await api(`/api/reports/${report.id}`, {}, false);
  console.log("invalid id / unauthorized detail:", invalidId.status, unauthenticatedDetail.status);

  const { error: secondUserError } = await supabase.auth.signInAnonymously();
  if (secondUserError) {
    console.log("second anonymous sign-in failed:", secondUserError.code || secondUserError.message);
    process.exitCode = 2;
    return;
  }
  const otherUserForm = new FormData();
  otherUserForm.set("image", new File([png], "sample.png", { type: "image/png" }));
  const otherUserUpload = await api(`/api/reports/${report.id}/image`, { method: "POST", body: otherUserForm });
  console.log("other user's upload status:", otherUserUpload.status);
}

main().catch((error) => {
  console.error("test harness failed:", error.message);
  process.exitCode = 1;
});
