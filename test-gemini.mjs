import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

console.log("Starting direct Gemini test...");

try {
  const response = await ai.interactions.create(
    {
      model: "gemini-3.8-flash",
      input: "Reply with exactly: Gemini is working",
    },
    { timeout: 15000 }
  );

  console.log("Gemini response:", response.output_text);
} catch (error) {
  console.error("Gemini error:", error);
}