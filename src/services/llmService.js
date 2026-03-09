import { GoogleGenAI } from "@google/genai";

export async function generateAnswer(context, question) {

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
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