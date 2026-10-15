"""Batched vector embeddings service using Google GenAI."""

import asyncio
import logging
from typing import List
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

BATCH_SIZE = 50
OUTPUT_DIMENSIONALITY = 768


async def generate_embedding(
    client: genai.Client,
    text: str,
    model: str = "gemini-embedding-001",
) -> List[float]:
    """Generates an embedding vector for a single query text."""
    config = types.EmbedContentConfig(output_dimensionality=OUTPUT_DIMENSIONALITY)
    response = await client.aio.models.embed_content(
        model=model,
        contents=text,
        config=config,
    )
    return response.embeddings[0].values


async def generate_embeddings(
    client: genai.Client,
    texts: List[str],
    model: str = "gemini-embedding-001",
) -> List[List[float]]:
    """
    Batches chunk embeddings in groups of 50 to avoid request-per-minute quota limits.
    """
    if not texts:
        return []

    config = types.EmbedContentConfig(output_dimensionality=OUTPUT_DIMENSIONALITY)
    vectors: List[List[float]] = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        response = await client.aio.models.embed_content(
            model=model,
            contents=batch,
            config=config,
        )
        for emb in response.embeddings:
            vectors.append(emb.values)

    return vectors
