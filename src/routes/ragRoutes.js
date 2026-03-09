import express from "express";
import { v4 as uuidv4 } from "uuid";
import { chunkText } from "../utils/chunker.js";
import { cosineSimilarity } from "../utils/cosineSimilarity.js";
import { generateEmbedding } from "../services/embeddingService.js";
import { generateAnswer } from "../services/llmService.js";
import { addDocument, getAllDocuments } from "../services/vectorStore.js";

const router = express.Router();

router.post("/upload", async (req, res) => {
  const { text } = req.body;

  const chunks = chunkText(text);

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk);
    addDocument(uuidv4(), embedding, chunk);
  }

  res.json({ message: "Document processed successfully" });
  
  console.log("Total chunks created:", chunks.length);
});

router.post("/ask", async (req, res) => {
  const { question } = req.body;

  const queryEmbedding = await generateEmbedding(question);

  const documents = getAllDocuments();

  const scoredDocs = documents.map(doc => ({
    ...doc,
    score: cosineSimilarity(queryEmbedding, doc.embedding)
  }));

  const topDocs = scoredDocs
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const context = topDocs.map(doc => doc.content).join("\n");

  const answer = await generateAnswer(context, question);

  res.json({ answer });

  console.log("Top scores:", topDocs.map(d => d.score));
});

export default router;