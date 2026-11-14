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
