import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY must be set");
}

export async function generateAnswer(context, question) {
  const ai = new GoogleGenAI({
    apiKey
  });

  const prompt = `
  Answer ONLY using the provided context.
  If the answer is not found in the context, say "I don't know".

  Context:
  ${context}

  Question:
  ${question}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  return response.text;
}