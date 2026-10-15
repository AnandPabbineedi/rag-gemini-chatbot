"""RAG Chatbot API route definitions for /upload, /ask, and /session."""

import logging
import re
from typing import Optional
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from google import genai

from ..config import Settings, get_settings
from ..schemas.rag import (
    AskRequest,
    AskResponse,
    ClearSessionResponse,
    ErrorResponse,
    SourceItem,
    UploadResponse,
)
from ..services.embeddings import generate_embedding, generate_embeddings
from ..services.llm import generate_answer
from ..services.vector_store import VectorStore, get_vector_store
from ..utils.chunker import chunk_text
from ..utils.pdf_extractor import extract_text_from_file
from .deps import check_ask_limits, check_upload_limits, require_session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["RAG"])

MAX_CHUNKS_PER_UPLOAD = 80
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_MIMETYPES = {"application/pdf", "text/plain"}


def clean_file_name(name: Optional[str]) -> str:
    """Sanitizes filename for clean display and storage."""
    base = name or "document"
    cleaned = re.sub(r"[^\w.\- ()]", "_", base)
    return cleaned[:120]


def get_genai_client(settings: Settings = Depends(get_settings)) -> genai.Client:
    """Dependency provider for Google GenAI client."""
    if not settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GEMINI_API_KEY or GOOGLE_API_KEY must be configured.",
        )
    return genai.Client(
        api_key=settings.api_key,
        http_options={"base_url": settings.gemini_base_url} if settings.gemini_base_url else None,
    )


@router.post(
    "/upload",
    response_model=UploadResponse,
    responses={
        400: {"model": ErrorResponse},
        413: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    dependencies=[Depends(check_upload_limits)],
    summary="Upload and vectorize a PDF or TXT file",
)
async def upload_document(
    file: UploadFile = File(...),
    session_id: str = Depends(require_session),
    vector_store: VectorStore = Depends(get_vector_store),
    client: genai.Client = Depends(get_genai_client),
    settings: Settings = Depends(get_settings),
):
    """Processes document by extracting text, chunking, and embedding into session store."""
    if file.content_type not in ALLOWED_MIMETYPES:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are allowed.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File is larger than 5 MB.")

    file_name = clean_file_name(file.filename)
    text = extract_text_from_file(file_bytes, file.content_type or "application/pdf")

    # Validate meaningful text
    if not text or len(re.sub(r"\s", "", text)) < 20:
        detail = (
            "No readable text found. This PDF may be a scanned image."
            if file.content_type == "application/pdf"
            else "This file is empty."
        )
        raise HTTPException(status_code=400, detail=detail)

    chunks = chunk_text(text)
    if len(chunks) > MAX_CHUNKS_PER_UPLOAD:
        pages = max(1, round(len(text) / 3000))
        raise HTTPException(
            status_code=400,
            detail=f"Too long for this demo (about {pages} pages). Upload up to about 40 pages, like a single chapter.",
        )

    try:
        embeddings = await generate_embeddings(
            client=client,
            texts=chunks,
            model=settings.gemini_embed_model,
        )

        # Overwrite file if re-uploading with identical name
        await vector_store.remove_file(session_id, file_name)

        for i, chunk in enumerate(chunks):
            doc_id = str(uuid.uuid4())
            await vector_store.add_document(
                session_id=session_id,
                doc_id=doc_id,
                embedding=embeddings[i],
                content=chunk,
                file_name=file_name,
            )

        logger.info('Processed "%s": %d chunks for session %s', file_name, len(chunks), session_id)
        return UploadResponse(
            message="Document processed successfully",
            fileName=file_name,
            chunksCreated=len(chunks),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Upload embedding error: %s", exc)
        err_msg = str(exc)
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
            raise HTTPException(status_code=429, detail="Today's free upload limit is used up. Try again in a bit.")
        raise HTTPException(status_code=500, detail="Couldn't process this file. Try again in a moment.")


@router.post(
    "/ask",
    response_model=AskResponse,
    responses={
        400: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    dependencies=[Depends(check_ask_limits)],
    summary="Query document context and generate answer",
)
async def ask_question(
    payload: AskRequest,
    response: Response,
    session_id: str = Depends(require_session),
    vector_store: VectorStore = Depends(get_vector_store),
    client: genai.Client = Depends(get_genai_client),
    settings: Settings = Depends(get_settings),
):
    """Retrieves relevant passages and synthesizes an answer using dynamic least-token fallback."""
    question = payload.question.strip()
    documents = await vector_store.get_documents(session_id)
    if not documents:
        return AskResponse(
            answer="Upload a document first, then ask me about it.",
            sources=[],
        )

    # Contextualize query with recent conversation
    history = payload.history[-6:]
    last_user_turn = next((m.text for m in reversed(history) if m.role == "user"), None)
    search_text = f"{last_user_turn}\n{question}" if last_user_turn else question

    try:
        query_embedding = await generate_embedding(
            client=client,
            text=search_text,
            model=settings.gemini_embed_model,
        )

        ranked = await vector_store.search(session_id, query_embedding)

        top_docs = [r[0] for r in ranked[:3]]
        top_scores = [r[1] for r in ranked[:3]]

        # Whole document context for small documents (<= 8 chunks); otherwise top 4 chunks
        if len(documents) <= 8:
            context_docs = sorted(ranked, key=lambda x: x[2])
            selected_docs = [r[0] for r in context_docs]
        else:
            selected_docs = [r[0] for r in ranked[:4]]

        context_str = "\n\n".join(f"[{d.file_name}]\n{d.content}" for d in selected_docs)

        answer_text, model_used = await generate_answer(
            client=client,
            api_key=settings.api_key,
            context=context_str,
            question=question,
            history=history,
            preferred_model=settings.gemini_model,
        )

        response.headers["X-AI-Model-Used"] = model_used

        source_items = [
            SourceItem(
                fileName=top_docs[i].file_name,
                excerpt=top_docs[i].content.strip()[:280],
                score=round(float(top_scores[i]), 2),
            )
            for i in range(len(top_docs))
        ]

        return AskResponse(
            answer=answer_text or "I couldn't produce an answer. Try rephrasing the question.",
            sources=source_items,
            model_used=model_used,
        )
    except HTTPException:
        raise
    except Exception as exc:
        err_msg = str(exc)
        logger.error("Ask endpoint error: %s", err_msg)
        is_busy = "503" in err_msg or "UNAVAILABLE" in err_msg or "high demand" in err_msg
        is_rate_limit = "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg

        if is_rate_limit:
            raise HTTPException(
                status_code=429,
                detail="Today's free AI quota is currently used up. Please try again later.",
            )
        if is_busy:
            raise HTTPException(
                status_code=503,
                detail="The AI service is currently experiencing high demand across all models. Please try again in a few moments.",
            )
        raise HTTPException(
            status_code=500,
            detail="Couldn't answer that right now. Try again in a moment.",
        )


@router.delete(
    "/session",
    response_model=ClearSessionResponse,
    summary="Clear all uploaded documents for this session",
)
async def clear_session_endpoint(
    session_id: str = Depends(require_session),
    vector_store: VectorStore = Depends(get_vector_store),
):
    """Purges in-memory vector embeddings for the calling browser session."""
    await vector_store.clear_session(session_id)
    return ClearSessionResponse(cleared=True)
