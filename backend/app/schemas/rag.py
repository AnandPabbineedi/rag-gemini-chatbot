"""Pydantic schemas for document upload, vector search, and QA."""

from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class MessageTurn(BaseModel):
    """A single turn in the conversation history."""

    role: Literal["user", "assistant"]
    text: str = Field(max_length=1500, description="Message text truncated to 1500 chars")


class AskRequest(BaseModel):
    """Payload for asking a question about uploaded documents."""

    question: str = Field(min_length=1, max_length=1000, description="Question text")
    history: List[MessageTurn] = Field(default_factory=list, description="Prior conversation context")


class SourceItem(BaseModel):
    """Retrieved passage cited as an answer source."""

    fileName: str = Field(description="Name of the source document")
    excerpt: str = Field(description="Passage excerpt text")
    score: float = Field(description="Cosine similarity relevance score")


class AskResponse(BaseModel):
    """Answer with source attribution returned to the frontend."""

    model_config = ConfigDict(populate_by_name=True)

    answer: str = Field(description="Generated answer from document context")
    sources: List[SourceItem] = Field(default_factory=list, description="Top matching passages")
    model_used: Optional[str] = Field(default=None, alias="_modelUsed", serialization_alias="_modelUsed")


class UploadResponse(BaseModel):
    """Status payload returned after document chunking and embedding."""

    message: str = "Document processed successfully"
    fileName: str
    chunksCreated: int


class ClearSessionResponse(BaseModel):
    """Payload returned after clearing in-memory session documents."""

    cleared: bool = True


class HealthStatusResponse(BaseModel):
    """Status payload for root health check."""

    status: str = "ok"
    preferredModel: str
    availableFallbackModels: List[str]


class ErrorResponse(BaseModel):
    """Consistent error payload."""

    error: str
