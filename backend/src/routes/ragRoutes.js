import express from "express";
import multer from "multer";
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParseModule = require("pdf-parse");
const pdfParseFn = typeof pdfParseModule === "function" ? pdfParseModule : null;
const PDFParse = pdfParseModule?.PDFParse || pdfParseModule?.default || null;
import { v4 as uuidv4 } from "uuid";
import { chunkText } from "../utils/chunker.js";
import { cosineSimilarity } from "../utils/cosineSimilarity.js";
import { generateEmbedding, generateEmbeddings } from "../services/embeddingService.js";

// Keeps uploads within the free Gemini quota (about 40 pages of text)
const MAX_CHUNKS_PER_UPLOAD = 80;
import { generateAnswer } from "../services/llmService.js";
import { addDocument, getDocuments, clearSession } from "../services/vectorStore.js";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const getSessionId = (req) => {
  const id = String(req.get("x-session-id") || "").slice(0, 64);
  return /^[a-zA-Z0-9-]{8,64}$/.test(id) ? id : "public";
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["application/pdf", "text/plain"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and TXT files are allowed"));
    }
  }
});

// Helper function to extract text from different file types
async function extractTextFromFile(filePath, fileType) {
  if (fileType === "application/pdf") {
    const dataBuffer = fs.readFileSync(filePath);

    if (pdfParseFn) {
      const result = await pdfParseFn(dataBuffer);
      return result.text;
    }

    if (PDFParse) {
      const parser = new PDFParse({ data: dataBuffer });
      const result = await parser.getText();
      if (parser.destroy) await parser.destroy();
      return result.text;
    }

    throw new Error("pdf-parse module is unavailable or has incompatible API");
  } else if (fileType === "text/plain") {
    return fs.readFileSync(filePath, "utf-8");
  }
  throw new Error("Unsupported file type");
}

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const filePath = req.file.path;
    const fileType = req.file.mimetype;
    const fileName = req.file.originalname;

    // Extract text from the uploaded file
    const text = await extractTextFromFile(filePath, fileType);

    if (!text || text.trim().length === 0) {
      fs.unlinkSync(filePath); // Clean up the file
      return res.status(400).json({ error: "File is empty or could not be read" });
    }

    // Chunk the text and create embeddings
    const chunks = chunkText(text);

    if (chunks.length > MAX_CHUNKS_PER_UPLOAD) {
      fs.unlinkSync(filePath);
      const pages = Math.round(text.length / 3000);
      return res.status(400).json({
        error: `Too long for this demo (about ${pages} pages). Upload up to about 40 pages, like a single chapter.`,
      });
    }

    const sessionId = getSessionId(req);
    const embeddings = await generateEmbeddings(chunks);
    chunks.forEach((chunk, i) => {
      addDocument(sessionId, uuidv4(), embeddings[i], chunk, fileName);
    });

    // Clean up the uploaded file
    fs.unlinkSync(filePath);

    res.json({
      message: "Document processed successfully",
      fileName,
      chunksCreated: chunks.length
    });

    console.log(`File "${fileName}" processed successfully. Total chunks created: ${chunks.length}`);
  } catch (error) {
    console.error("Upload error:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    const status = error.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? error.message : "Couldn't process this file. Try a different PDF or TXT.",
    });
  }
});

router.post("/ask", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const documents = getDocuments(getSessionId(req));
    if (documents.length === 0) {
      return res.json({
        answer: "Upload a document first, then ask me about it.",
        sources: [],
      });
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
    const contextDocs = documents.length <= 8
      ? [...ranked].sort((a, b) => a.index - b.index)
      : ranked.slice(0, 4);

    const context = contextDocs.map((doc) => `[${doc.fileName}]\n${doc.content}`).join("\n\n");
    const answer = await generateAnswer(context, question, history);

    res.json({
      answer,
      sources: topDocs.map((d) => ({
        fileName: d.fileName,
        excerpt: d.content.trim().slice(0, 280),
        score: Math.round(d.score * 100) / 100,
      })),
    });
  } catch (error) {
    console.error("Ask error:", error);
    const status = error.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? error.message : "Couldn't answer that right now. Try again in a moment.",
    });
  }
});

router.delete("/session", (req, res) => {
  clearSession(getSessionId(req));
  res.json({ cleared: true });
});

export default router;