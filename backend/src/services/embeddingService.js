import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY must be set");
}

const ai = new GoogleGenAI({ apiKey });
const MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
const BATCH_SIZE = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries once when the free-tier rate limit is hit, waiting as long as Google asks
async function withRetry(fn, retries = 1) {
  try {
    return await fn();
  } catch (err) {
    const msg = String(err?.message || "");
    const isRateLimit = err?.status === 429 || msg.includes("RESOURCE_EXHAUSTED");
    if (isRateLimit && retries > 0) {
      const wait = Number(msg.match(/retry in ([\d.]+)s/i)?.[1] || 30);
      await sleep(Math.min(wait, 60) * 1000 + 500);
      return withRetry(fn, retries - 1);
    }
    if (isRateLimit) {
      const e = new Error("The AI service is busy right now. Wait a minute and try again.");
      e.status = 429;
      throw e;
    }
    throw err;
  }
}

export async function generateEmbedding(text) {
  const response = await withRetry(() =>
    ai.models.embedContent({ model: MODEL, contents: text })
  );
  return response.embeddings[0].values;
}

// Embeds many chunks in batched requests instead of one request per chunk
export async function generateEmbeddings(texts) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await withRetry(() =>
      ai.models.embedContent({ model: MODEL, contents: batch })
    );
    vectors.push(...response.embeddings.map((e) => e.values));
  }
  return vectors;
}
