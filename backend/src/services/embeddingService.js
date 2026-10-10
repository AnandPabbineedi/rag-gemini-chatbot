import { GoogleGenAI } from "@google/genai";
import { withRateLimit } from "../utils/rateLimit.js";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY must be set");
}

// GEMINI_BASE_URL is only for local testing against a mock server
const ai = new GoogleGenAI({ apiKey, ...(process.env.GEMINI_BASE_URL && { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } }) });
const MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
const BATCH_SIZE = 50;
// 768 dimensions instead of the default 3072: 4x less memory, nearly the same retrieval quality
const config = { outputDimensionality: 768 };
export async function generateEmbedding(text) {
  const response = await withRateLimit(() =>
    ai.models.embedContent({ model: MODEL, contents: text, config })
  );
  return response.embeddings[0].values;
}

// Embeds many chunks in batched requests instead of one request per chunk
export async function generateEmbeddings(texts) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await withRateLimit(() =>
      ai.models.embedContent({ model: MODEL, contents: batch, config })
    );
    vectors.push(...response.embeddings.map((e) => e.values));
  }
  return vectors;
}
