// Splits text into overlapping chunks, preferring to break at sentence ends
export function chunkText(text, chunkSize = 1500, overlap = 200) {
  const clean = text.replace(/\s+/g, " ").trim();
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);
    if (end < clean.length) {
      const lastStop = clean.lastIndexOf(". ", end);
      if (lastStop > start + chunkSize * 0.6) end = lastStop + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks.filter(Boolean);
}
