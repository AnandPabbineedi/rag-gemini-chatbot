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
import { generateEmbedding } from "../services/embeddingService.js";
import { generateAnswer } from "../services/llmService.js";
import { addDocument, getAllDocuments } from "../services/vectorStore.js";

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

const upload = multer({
  storage,
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

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk);
      addDocument(uuidv4(), embedding, chunk);
    }

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
    res.status(500).json({ error: error.message });
  }
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