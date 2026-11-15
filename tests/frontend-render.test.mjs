import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadComponent(path, dependencies) {
  const output = {};
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "exports", source)(name => dependencies[name] ?? require(name), output);
  return output;
}

test("report cards display real title/location safely and do not expose storage paths", () => {
  const { ReportCard } = loadComponent("app/components/report-card.tsx", {
    "./report-photo": { ReportPhoto: () => createElement("div", null, "No photo") },
  });
  const html = renderToStaticMarkup(createElement(ReportCard, {
    report: { id: "database-uuid", title: "Bag <script>", location: "Main Library", image_path: "private/storage/path" },
    onOpen: () => {},
  }));
  assert.match(html, /Bag &lt;script&gt;/); assert.match(html, /Main Library/);
  assert.doesNotMatch(html, /private\/storage\/path/);
});

test("authentication form has real credentials fields, no fake login, and disables unavailable client", () => {
  const { AuthForm } = loadComponent("app/components/auth.tsx", {
    "@/lib/supabase/client": { createClient: () => { throw new Error("not configured"); } },
  });
  const html = renderToStaticMarkup(createElement(AuthForm, { client: null }));
  assert.match(html, /Sign in to Lost Signal/); assert.match(html, /type="email"/);
  assert.match(html, /type="password"/); assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /seedItems|Campus Finds/);
});

test("browse UI distinguishes loading, errors and empty reports", () => {
  const { ReportGrid } = loadComponent("app/components/report-card.tsx", {
    "./report-photo": { ReportPhoto: () => null },
  });
  const render = props => renderToStaticMarkup(createElement(ReportGrid, {
    reports: [], loading: false, error: "", onRetry: () => {}, onOpen: () => {}, ...props,
  }));
  assert.match(render({ loading: true }), /role="status"/);
  assert.doesNotMatch(render({ loading: true }), /No open found reports/);
  assert.match(render({ error: "Session expired" }), /role="alert"/);
  assert.match(render({ error: "Session expired" }), /Retry reports/);
  assert.doesNotMatch(render({ error: "Session expired" }), /No open found reports/);
  assert.match(render({}), /No open found reports/);
});


test("critical demo JSX files parse without syntax errors", () => {
  for (const path of ["app/page.tsx", "app/components/report-form.tsx", "app/components/messages-view.tsx",
    "app/components/browse-view.tsx", "app/components/notification-bell.tsx"]) {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
    assert.deepEqual(source.parseDiagnostics.map(problem => problem.messageText), [], path);
  }
});

test("claim review and guest flows expose clear, safe next steps in the UI source", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /Review claim/);
  assert.match(page, /Pickup pending/);
  assert.match(page, /window\.confirm\(decision\)/);
  assert.match(page, /Ready to report an item\?/);
  assert.match(page, /Proof from claimant/);
  const messages = readFileSync("app/components/messages-view.tsx", "utf8");
  assert.match(messages, /Browse found items/);
  assert.match(messages, /Tips for a safe handoff/);
});
