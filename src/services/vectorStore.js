let documents = [];

export function addDocument(id, embedding, content) {
  documents.push({ id, embedding, content });
}

export function getAllDocuments() {
  return documents;
}