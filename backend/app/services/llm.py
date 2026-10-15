"""Question answering using document excerpts and dynamic Gemini fallback."""

import logging
from typing import List, Optional, Tuple
from google import genai

from ..schemas.rag import MessageTurn
from .model_manager import generate_content_with_dynamic_fallback

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You answer questions about documents the user has uploaded.

Rules:
- Treat the document excerpts as your source of truth for facts about the documents.
- You may summarize, explain, analyze, critique, compare and suggest improvements to the documents. Use general knowledge to do this well.
- If the user asks for a fact that is not in the excerpts, say you couldn't find it in the uploaded documents instead of guessing.
- Use the earlier conversation to understand follow-up questions like "what about the second one?" or "I meant the tone".
- Keep answers clear and concise. Use short paragraphs or lists when it helps."""


async def generate_answer(
    client: genai.Client,
    api_key: str,
    context: str,
    question: str,
    history: List[MessageTurn],
    preferred_model: str,
) -> Tuple[str, str]:
    """
    Synthesizes an answer grounded in retrieved document excerpts.
    
    Returns:
        Tuple of (answer_text, model_used)
    """
    conversation = "\n".join(
        f"{'Assistant' if m.role == 'assistant' else 'User'}: {m.text}"
        for m in history
    )

    conv_section = f"\nConversation so far:\n{conversation}\n" if conversation else ""
    prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        f'Document excerpts:\n"""\n{context}\n"""\n'
        f"{conv_section}\n"
        f"User: {question}\n"
        "Assistant:"
    )

    result = await generate_content_with_dynamic_fallback(
        client=client,
        api_key=api_key,
        contents=prompt,
        preferred_model=preferred_model,
    )

    return result["text"], result["model_used"]
