import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ragRoutes from "./routes/ragRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.json({ status: "ok" }));
app.use("/api", ragRoutes);

// Turn upload errors (wrong type, too large) into readable JSON
app.use((err, req, res, next) => {
  const msg = err.code === "LIMIT_FILE_SIZE" ? "File is larger than 5 MB" : err.message;
  res.status(400).json({ error: msg });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
