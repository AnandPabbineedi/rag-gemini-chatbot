// In-memory vector store, scoped per browser session so visitors
// only ever search their own documents. Embeddings are stored as
// Float32Array to keep memory low on small servers.
const MAX_CHUNKS_PER_SESSION = 300;
const MAX_SESSIONS = 50;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // idle sessions expire after 6 hours

const sessions = new Map(); // sessionId -> { docs: [...], lastUsed }

function touch(sessionId) {
  let s = sessions.get(sessionId);
  if (!s) {
    if (sessions.size >= MAX_SESSIONS) {
      // Evict the least recently used session
      let oldest = null;
      for (const [id, v] of sessions) if (!oldest || v.lastUsed < oldest[1].lastUsed) oldest = [id, v];
      sessions.delete(oldest[0]);
    }
    s = { docs: [], lastUsed: Date.now() };
    sessions.set(sessionId, s);
  }
  s.lastUsed = Date.now();
  return s;
}

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) if (s.lastUsed < cutoff) sessions.delete(id);
}, 30 * 60 * 1000).unref();

export function addDocument(sessionId, id, embedding, content, fileName) {
  const s = touch(sessionId);
  s.docs.push({ id, embedding: Float32Array.from(embedding), content, fileName });
  if (s.docs.length > MAX_CHUNKS_PER_SESSION) s.docs.splice(0, s.docs.length - MAX_CHUNKS_PER_SESSION);
}

export function getDocuments(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return [];
  s.lastUsed = Date.now();
  return s.docs;
}

export function removeFile(sessionId, fileName) {
  const s = sessions.get(sessionId);
  if (s) s.docs = s.docs.filter((d) => d.fileName !== fileName);
}

export function clearSession(sessionId) {
  sessions.delete(sessionId);
}
