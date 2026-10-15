"""Unit and integration tests for RAG Chatbot FastAPI backend."""

from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

TEST_SESSION_ID = "test-session-12345678"


def test_root_health_check(client: TestClient):
    """Verifies that GET / returns 200 with status ok."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "preferredModel" in data
    assert isinstance(data["availableFallbackModels"], list)


def test_upload_missing_session_rejected(client: TestClient):
    """Verifies that upload without x-session-id is rejected with 400."""
    response = client.post(
        "/api/upload",
        files={"file": ("test.txt", b"Some sample document content", "text/plain")},
    )
    assert response.status_code == 400
    assert "Missing session" in response.json()["error"]


def test_upload_empty_file_rejected(client: TestClient):
    """Verifies that empty file upload is rejected with 400."""
    response = client.post(
        "/api/upload",
        headers={"x-session-id": TEST_SESSION_ID},
        files={"file": ("empty.txt", b"", "text/plain")},
    )
    assert response.status_code == 400
    assert "empty" in response.json()["error"].lower() or "readable" in response.json()["error"].lower()


def test_upload_valid_file_mocked(client: TestClient):
    """Verifies successful document chunking and vector storage."""
    mock_vectors = [[0.1] * 768]
    doc_content = (
        "The Kawasaki Ninja ZX-10R is a sport motorcycle. "
        "It features an inline four-cylinder engine with over 200 horsepower. "
        "The chassis utilizes an aluminum twin-spar design with advanced traction control."
    )

    with patch("app.api.routes.generate_embeddings", new_callable=AsyncMock) as mock_embeds:
        mock_embeds.return_value = mock_vectors

        response = client.post(
            "/api/upload",
            headers={"x-session-id": TEST_SESSION_ID},
            files={"file": ("ninja.txt", doc_content.encode("utf-8"), "text/plain")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Document processed successfully"
        assert data["fileName"] == "ninja.txt"
        assert data["chunksCreated"] >= 1


def test_ask_no_documents_returns_prompt(client: TestClient):
    """Verifies that asking a question before uploading any documents prompts the user."""
    fresh_session = "fresh-session-87654321"
    response = client.post(
        "/api/ask",
        headers={"x-session-id": fresh_session},
        json={"question": "What is the horsepower?", "history": []},
    )
    assert response.status_code == 200
    data = response.json()
    assert "Upload a document first" in data["answer"]
    assert data["sources"] == []


def test_ask_with_documents_mocked(client: TestClient):
    """Verifies semantic search and grounded answer generation."""
    with (
        patch("app.api.routes.generate_embedding", new_callable=AsyncMock) as mock_q_embed,
        patch("app.api.routes.generate_answer", new_callable=AsyncMock) as mock_ans,
    ):
        mock_q_embed.return_value = [0.1] * 768
        mock_ans.return_value = ("The Ninja ZX-10R produces over 200 horsepower.", "gemini-3.5-flash-lite")

        response = client.post(
            "/api/ask",
            headers={"x-session-id": TEST_SESSION_ID},
            json={"question": "What is the horsepower?", "history": []},
        )
        assert response.status_code == 200
        data = response.json()
        assert "200 horsepower" in data["answer"]
        assert data["_modelUsed"] == "gemini-3.5-flash-lite"
        assert response.headers.get("X-AI-Model-Used") == "gemini-3.5-flash-lite"
        assert len(data["sources"]) >= 1


def test_clear_session(client: TestClient):
    """Verifies that DELETE /api/session purges stored vectors."""
    response = client.delete(
        "/api/session",
        headers={"x-session-id": TEST_SESSION_ID},
    )
    assert response.status_code == 200
    assert response.json()["cleared"] is True
