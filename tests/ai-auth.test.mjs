import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as protection from "../lib/ai-protection.ts";

// Execute the actual guard with only the external Supabase session mocked.
function guard(user, error = null) {
  let calls = 0;
  const output = {};
  const source = ts.transpileModule(readFileSync("lib/ai-request.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", source)(name => {
    if (name === "@/lib/ai-protection") return protection;
    if (name === "@/lib/supabase/server") return { createClient: async () => ({
      auth: { getUser: async () => { calls++; return { data: { user }, error }; } },
    }) };
    throw new Error(`Unexpected import: ${name}`);
  }, output);
  return { ...output, calls: () => calls };
}

test("missing or invalid Supabase sessions are denied", async () => {
  const request = new Request("http://localhost/api/describe");
  assert.equal((await guard(null).authorizeAnalysis(request)).status, 401);
  assert.equal((await guard({ id: "u" }, new Error("expired")).authorizeAnalysis(request)).status, 401);
});

test("authenticated calls share a quota and cross-origin requests are denied", async () => {
  const auth = guard({ id: "user-1" });
  for (let i = 0; i < 10; i++) {
    assert.equal(await auth.authorizeAnalysis(new Request(`http://localhost/api/${i % 2 ? "describe" : "analyze-image"}`)), null);
  }
  const blocked = await auth.authorizeAnalysis(new Request("http://localhost/api/describe"));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  const before = auth.calls();
  assert.equal((await auth.authorizeAnalysis(new Request("http://localhost/api/describe", {
    headers: { Origin: "http://other.example" },
  }))).status, 403);
  assert.equal(auth.calls(), before);
});
