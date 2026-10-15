"""Pytest fixtures for RAG FastAPI testing."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    """Yields a TestClient configured with the RAG FastAPI app."""
    with TestClient(app) as test_client:
        yield test_client
