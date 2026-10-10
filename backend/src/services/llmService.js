import { GoogleGenAI } from "@google/genai";
import { withRateLimit } from "../utils/rateLimit.js";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY must be set");
}

const ai = new GoogleGenAI({ apiKey });

const SYSTEM_PROMPT = `You answer questions about documents the user has uploaded.

Rules:
- Treat the document excerpts as your source of truth for facts about the documents.
- You may summarize, explain, analyze, critique, compare and suggest improvements to the documents. Use general knowledge to do this well.
- If the user asks for a fact that is not in the excerpts, say you couldn't find it in the uploaded documents instead of guessing.
- Use the earlier conversation to understand follow-up questions like "what about the second one?" or "I meant the tone".
- Keep answers clear and concise. Use short paragraphs or lists when it helps.`;

// history: [{ role: "user" | "assistant", text }]
export async function generateAnswer(context, question, history = []) {
  const conversation = history
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.text}`)
    .join("\n");

  const prompt = `${SYSTEM_PROMPT}

Document excerpts:
"""
${context}
"""
${conversation ? `\nConversation so far:\n${conversation}\n` : ""}
User: ${question}
Assistant:`;

  const response = await withRateLimit(() =>
    ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: prompt,
    })
  );

  return response.text;
}
