// In-memory vector store, scoped per browser session so visitors
// only ever search their own documents.
const MAX_CHUNKS_PER_SESSION = 500;
const MAX_SESSIONS = 200;

const sessions = new Map(); // sessionId -> [{ id, embedding, content, fileName }]

export function addDocument(sessionId, id, embedding, content, fileName) {
  if (!sessions.has(sessionId)) {
    // Evict the oldest session when the store is full
    if (sessions.size >= MAX_SESSIONS) {
      sessions.delete(sessions.keys().next().value);
    }
    sessions.set(sessionId, []);
  }
  const docs = sessions.get(sessionId);
  docs.push({ id, embedding, content, fileName });
  if (docs.length > MAX_CHUNKS_PER_SESSION) docs.shift();
}

export function getDocuments(sessionId) {
  return sessions.get(sessionId) || [];
}

export function clearSession(sessionId) {
  sessions.delete(sessionId);
}
