import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ragRoutes from "./routes/ragRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Render sits behind a proxy; this makes req.ip the real visitor IP for rate limiting
app.set("trust proxy", 1);

// Only our own sites can call the API from a browser (extra origins via ALLOWED_ORIGINS, comma-separated)
const allowedOrigins = [
  "https://rag.anandpabbineedi.site",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  ...String(process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
];
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)) }));
app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => res.json({ status: "ok" }));
app.use("/api", ragRoutes);

// Turn upload errors (wrong type, too large) into readable JSON
app.use((err, req, res, next) => {
  const tooBig = err.code === "LIMIT_FILE_SIZE";
  const status = tooBig ? 413 : err.status || (err.type === "entity.too.large" ? 413 : 400);
  const error = tooBig ? "File is larger than 5 MB"
    : err.type === "entity.parse.failed" ? "Invalid request"
    : status < 500 ? err.message : "Something went wrong";
  res.status(status).json({ error });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
