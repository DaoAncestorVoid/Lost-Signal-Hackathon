import nextEnv from "@next/env";
import { createServerClient } from "@supabase/ssr";

nextEnv.loadEnvConfig(process.cwd());

const base = process.env.CLAIMS_API_BASE_URL || "http://localhost:3100";

async function signInTestUser() {
  const cookies = new Map();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
      },
    },
  );
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Anonymous sign-in failed: ${error?.code || "no user"}`);
  return {
    id: data.user.id,
    cookie: () => [...cookies].map(([name, value]) =>
      `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("; "),
  };
}

async function api(user, path, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(user ? { Cookie: user.cookie() } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

function expect(label, actual, expected) {
  console.log(`${label}: ${actual} (expected ${expected})`);
  if (actual !== expected) process.exitCode = 1;
}

async function main() {
  const finder = await signInTestUser();
  const claimant = await signInTestUser();
  const report = await api(finder, "/api/reports", "POST", {
    report_type: "found",
    title: `Claims smoke test ${new Date().toISOString()}`,
    description: "A test item created by the claims smoke test",
    location: "HackUMass test",
  });
  expect("create found report", report.status, 201);
  if (!report.data.report?.id) return;
  const reportId = report.data.report.id;

  const own = await api(finder, "/api/claims", "POST", { report_id: reportId, proof: "Mine" });
  expect("finder cannot claim own report", own.status, 403);

  const submitted = await api(claimant, "/api/claims", "POST", {
    report_id: reportId,
    proof: "The item has a small mark under the strap",
  });
  expect("claimant submits proof", submitted.status, 201);
  if (!submitted.data.claim?.id) return;
  const claimId = submitted.data.claim.id;
  console.log("report id:", reportId, "claim id:", claimId);

  expect("duplicate claim", (await api(claimant, "/api/claims", "POST", {
    report_id: reportId, proof: "Duplicate",
  })).status, 409);
  for (const [label, user] of [["claimant", claimant], ["finder", finder]]) {
    const list = await api(user, "/api/claims");
    expect(`${label} list`, list.status, 200);
    expect(`${label} can see claim`, list.data.claims?.some((claim) => claim.id === claimId), true);
    expect(`${label} detail`, (await api(user, `/api/claims/${claimId}`)).status, 200);
  }

  expect("claimant cannot decide", (await api(claimant, `/api/claims/${claimId}`, "PATCH", {
    status: "approved",
  })).status, 404);
  expect("invalid decision", (await api(finder, `/api/claims/${claimId}`, "PATCH", {
    status: "pending",
  })).status, 400);
  expect("finder approves", (await api(finder, `/api/claims/${claimId}`, "PATCH", {
    status: "approved",
  })).status, 200);
  const resolved = await api(finder, `/api/reports/${reportId}`);
  expect("report resolved", resolved.data.report?.status, "resolved");
  expect("repeat approval blocked", (await api(finder, `/api/claims/${claimId}`, "PATCH", {
    status: "approved",
  })).status, 409);
  expect("resolved report cannot be claimed", (await api(claimant, "/api/claims", "POST", {
    report_id: reportId, proof: "Too late",
  })).status, 409);

  const lostReport = await api(finder, "/api/reports", "POST", {
    report_type: "lost", title: "Lost item claims test", description: "Test only", location: "HackUMass test",
  });
  expect("create lost report", lostReport.status, 201);
  if (lostReport.data.report?.id) {
    expect("lost report cannot be claimed", (await api(claimant, "/api/claims", "POST", {
      report_id: lostReport.data.report.id, proof: "Not a found item",
    })).status, 409);
  }

  const secondReport = await api(finder, "/api/reports", "POST", {
    report_type: "found", title: "Rejection claims test", description: "Test only", location: "HackUMass test",
  });
  expect("create second found report", secondReport.status, 201);
  if (secondReport.data.report?.id) {
    const secondClaim = await api(claimant, "/api/claims", "POST", {
      report_id: secondReport.data.report.id, proof: "Second test claim",
    });
    expect("submit second claim", secondClaim.status, 201);
    if (secondClaim.data.claim?.id) {
      expect("finder rejects", (await api(finder, `/api/claims/${secondClaim.data.claim.id}`, "PATCH", {
        status: "rejected",
      })).status, 200);
      const stillOpen = await api(finder, `/api/reports/${secondReport.data.report.id}`);
      expect("rejected report stays open", stillOpen.data.report?.status, "open");
    }
  }
  expect("unauthenticated list", (await api(null, "/api/claims")).status, 401);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
