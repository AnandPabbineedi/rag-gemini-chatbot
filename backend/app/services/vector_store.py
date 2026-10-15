"""In-memory session-isolated vector store with vectorized NumPy cosine similarity."""

import asyncio
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, List, Tuple
import numpy as np


@dataclass
class StoredDocument:
    """Represents a chunk and its corresponding vector embedding."""

    id: str
    embedding: np.ndarray  # float32 1D array
    content: str
    file_name: str


class VectorStore:
    """Thread-safe, session-isolated in-memory vector store."""

    def __init__(self) -> None:
        self._sessions: Dict[str, List[StoredDocument]] = {}
        self._lock = asyncio.Lock()

    async def add_document(
        self,
        session_id: str,
        doc_id: str,
        embedding: List[float],
        content: str,
        file_name: str,
    ) -> None:
        """Stores a document chunk and its embedding vector."""
        vec = np.asarray(embedding, dtype=np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm  # Pre-normalize for instant dot product

        doc = StoredDocument(
            id=doc_id,
            embedding=vec,
            content=content,
            file_name=file_name,
        )

        async with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = []
            self._sessions[session_id].append(doc)

    async def remove_file(self, session_id: str, file_name: str) -> None:
        """Removes existing chunks for a file (supports re-upload replacement)."""
        async with self._lock:
            if session_id in self._sessions:
                self._sessions[session_id] = [
                    d for d in self._sessions[session_id] if d.file_name != file_name
                ]

    async def clear_session(self, session_id: str) -> None:
        """Cleans up all documents associated with a session."""
        async with self._lock:
            self._sessions.pop(session_id, None)

    async def get_documents(self, session_id: str) -> List[StoredDocument]:
        """Returns all documents for a given session."""
        async with self._lock:
            return list(self._sessions.get(session_id, []))

    async def search(
        self,
        session_id: str,
        query_embedding: List[float],
    ) -> List[Tuple[StoredDocument, float, int]]:
        """
        Calculates cosine similarities for all stored session chunks using vectorized matrix operations.

        Returns:
            List of tuples (StoredDocument, score, original_index) sorted by descending similarity score.
        """
        async with self._lock:
            docs = list(self._sessions.get(session_id, []))

        if not docs:
            return []

        q_vec = np.asarray(query_embedding, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm > 0:
            q_vec = q_vec / q_norm

        # Matrix of shape (N, dim)
        matrix = np.vstack([d.embedding for d in docs])
        # Vectorized dot product against pre-normalized vectors
        scores = np.dot(matrix, q_vec).tolist()

        ranked = [
            (docs[i], float(scores[i]), i)
            for i in range(len(docs))
        ]
        ranked.sort(key=lambda x: x[1], reverse=True)
        return ranked


@lru_cache
def get_vector_store() -> VectorStore:
    """Singleton getter for the in-memory vector store."""
    return VectorStore()
