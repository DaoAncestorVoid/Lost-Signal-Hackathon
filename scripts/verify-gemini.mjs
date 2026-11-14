// Run explicitly: node --env-file=.env.local --experimental-strip-types scripts/verify-gemini.mjs
// Makes real billable model requests; never included in npm test.
import { GoogleGenAI } from "@google/genai";
import { analyzeImage, analyzeItem, GEMINI_MODEL } from "../lib/gemini.ts";

process.env.GEMINI_MOCK_MODE = "false";
if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: "v1beta" });
let failed = false;
for (const [name, run] of [
  ["model availability", async () => {
    const model = await ai.models.get({ model: GEMINI_MODEL, config: { httpOptions: { timeout: 15000 } } });
    console.log(JSON.stringify({ model: model.name, methods: model.supportedActions }));
  }],
  ["live text analysis", async () => {
    console.log(JSON.stringify(await analyzeItem("Black Sony over-ear headphones with padded earcups")));
  }],
  ["live image analysis (Google's public scones sample photograph)", async () => {
    const response = await fetch("https://storage.googleapis.com/generativeai-downloads/images/scones.jpg", {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Fixture download returned ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    console.log(JSON.stringify(await analyzeImage(bytes.toString("base64"), "image/jpeg")));
  }],
]) {
  try { await run(); console.log(`PASS: ${name}`); }
  catch (error) {
    failed = true;
    const message = String(error.message).replaceAll(process.env.GEMINI_API_KEY, "[REDACTED]");
    console.error(JSON.stringify({ check: name, status: error.status, message }));
  }
}
if (failed) process.exitCode = 1;
