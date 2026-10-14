import express from "express";
import multer from "multer";
import { createRequire } from "module";
import { v4 as uuidv4 } from "uuid";
import { chunkText } from "../utils/chunker.js";
import { cosineSimilarity } from "../utils/cosineSimilarity.js";
import { perIpLimit, dailyCap } from "../utils/limiter.js";
import { generateEmbedding, generateEmbeddings } from "../services/embeddingService.js";
import { generateAnswer } from "../services/llmService.js";
import { addDocument, getDocuments, removeFile, clearSession } from "../services/vectorStore.js";

const require = createRequire(import.meta.url);
const pdfParseModule = require("pdf-parse");
const pdfParseFn = typeof pdfParseModule === "function" ? pdfParseModule : null;
const PDFParse = pdfParseModule?.PDFParse || pdfParseModule?.default || null;

const router = express.Router();

// Keeps uploads within the free Gemini quota (about 40 pages of text)
const MAX_CHUNKS_PER_UPLOAD = 80;
const MAX_QUESTION = 1000;

const HOUR = 60 * 60 * 1000;
const uploadLimits = [
  perIpLimit({ windowMs: HOUR, max: Number(process.env.UPLOADS_PER_HOUR || 10),
    message: "You've reached the hourly upload limit for this demo. Try again in a bit." }),
  dailyCap({ max: Number(process.env.DAILY_UPLOADS || 100),
    message: "Today's free upload limit is used up. Please try again tomorrow." }),
];
const askLimits = [
  perIpLimit({ windowMs: HOUR, max: Number(process.env.QUESTIONS_PER_HOUR || 30),
    message: "You've reached the hourly question limit for this demo. Try again in a bit." }),
  dailyCap({ max: Number(process.env.DAILY_QUESTIONS || 300),
    message: "Today's free question limit is used up. Please try again tomorrow." }),
];

const getSessionId = (req) => {
  const id = String(req.get("x-session-id") || "").slice(0, 64);
  return /^[a-zA-Z0-9-]{8,64}$/.test(id) ? id : null;
};

const requireSession = (req, res, next) => {
  req.sessionId = getSessionId(req);
  if (!req.sessionId) return res.status(400).json({ error: "Missing session. Refresh the page and try again." });
  next();
};

// Files stay in memory only: nothing is written to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["application/pdf", "text/plain"].includes(file.mimetype);
    cb(ok ? null : Object.assign(new Error("Only PDF and TXT files are allowed"), { status: 400 }), ok);
  },
});

async function extractText(buffer, mimetype) {
  if (mimetype === "text/plain") return buffer.toString("utf-8");
  if (pdfParseFn) return (await pdfParseFn(buffer)).text;
  if (PDFParse) {
    const parser = new PDFParse({ data: buffer });
    try {
      return (await parser.getText()).text;
    } finally {
      if (parser.destroy) await parser.destroy();
    }
  }
  throw new Error("PDF reader unavailable");
}

const cleanName = (name) => String(name || "document").replace(/[^\w.\- ()]/g, "_").slice(0, 120);

router.post("/upload", requireSession, uploadLimits, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  const fileName = cleanName(req.file.originalname);

  let text;
  try {
    text = await extractText(req.file.buffer, req.file.mimetype);
  } catch (err) {
    console.error("Extract error:", err?.message);
    const encrypted = /password|encrypt/i.test(String(err?.message));
    return res.status(400).json({
      error: encrypted ? "This PDF is password-protected. Remove the password and try again." : "Couldn't read this file. Try a different PDF or TXT.",
    });
  }

  if (!text || text.replace(/\s/g, "").length < 20) {
    return res.status(400).json({
      error: req.file.mimetype === "application/pdf"
        ? "No readable text found. This PDF may be a scanned image."
        : "This file is empty.",
    });
  }

  const chunks = chunkText(text);
  if (chunks.length > MAX_CHUNKS_PER_UPLOAD) {
    const pages = Math.round(text.length / 3000);
    return res.status(400).json({
      error: `Too long for this demo (about ${pages} pages). Upload up to about 40 pages, like a single chapter.`,
    });
  }

  try {
    const embeddings = await generateEmbeddings(chunks);
    removeFile(req.sessionId, fileName); // re-uploading the same file replaces it
    chunks.forEach((chunk, i) => addDocument(req.sessionId, uuidv4(), embeddings[i], chunk, fileName));
    res.json({ message: "Document processed successfully", fileName, chunksCreated: chunks.length });
    console.log(`Processed "${fileName}": ${chunks.length} chunks`);
  } catch (error) {
    console.error("Upload error:", error?.message);
    const status = error.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? error.message : "Couldn't process this file. Try again in a moment.",
    });
  }
});

router.post("/ask", requireSession, askLimits, async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    if (!question) return res.status(400).json({ error: "Question is required" });
    if (question.length > MAX_QUESTION) {
      return res.status(400).json({ error: `Keep questions under ${MAX_QUESTION} characters.` });
    }

    const documents = getDocuments(req.sessionId);
    if (documents.length === 0) {
      return res.json({ answer: "Upload a document first, then ask me about it.", sources: [] });
    }

    // Last few turns, trimmed, so follow-up questions have context
    const history = (Array.isArray(req.body?.history) ? req.body.history : [])
      .slice(-6)
      .filter((m) => m && typeof m.text === "string" && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, text: m.text.slice(0, 1500) }));

    // Search with the previous question too, so "what about X?" still finds the right passages
    const lastUserTurn = [...history].reverse().find((m) => m.role === "user");
    const searchText = lastUserTurn ? `${lastUserTurn.text}\n${question}` : question;
    const queryEmbedding = await generateEmbedding(searchText);

    const ranked = documents
      .map((doc, index) => ({ ...doc, index, score: cosineSimilarity(queryEmbedding, doc.embedding) }))
      .sort((a, b) => b.score - a.score);

    const topDocs = ranked.slice(0, 3);
    // Small documents fit entirely in the prompt, which gives better whole-document answers
    const contextDocs = documents.length <= 8 ? [...ranked].sort((a, b) => a.index - b.index) : ranked.slice(0, 4);

    const context = contextDocs.map((doc) => `[${doc.fileName}]\n${doc.content}`).join("\n\n");
    const answer = await generateAnswer(context, question, history);

    res.json({
      answer: answer || "I couldn't produce an answer. Try rephrasing the question.",
      sources: topDocs.map((d) => ({
        fileName: d.fileName,
        excerpt: d.content.trim().slice(0, 280),
        score: Math.round(d.score * 100) / 100,
      })),
    });
  } catch (error) {
    console.error("Ask error:", error?.message || error);
    const msg = String(error?.message || "");
    const isBusy = error?.status === 503 || msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE");
    const isRateLimit = error?.status === 429 || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
    const status = isRateLimit ? 429 : isBusy ? 503 : 500;
    const userMessage = isRateLimit
      ? (error?.message && !error.message.startsWith("{") ? error.message : "Today's free AI quota is currently used up. Please try again later.")
      : isBusy
      ? "The AI service is currently experiencing high demand across all models. Please try again in a few moments."
      : "Couldn't answer that right now. Try again in a moment.";
    res.status(status).json({ error: userMessage });
  }
});

router.delete("/session", requireSession, (req, res) => {
  clearSession(req.sessionId);
  res.json({ cleared: true });
});

export default router;
