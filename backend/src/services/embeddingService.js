import { GoogleGenAI } from "@google/genai";

export async function generateEmbedding(text) {

  const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

  const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
  });

  return response.embeddings[0].values;
}