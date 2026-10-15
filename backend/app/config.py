"""Configuration settings for RAG Gemini Chatbot."""

from functools import lru_cache
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and defaults."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Ask Your Documents - RAG API"
    app_version: str = "2.0.0"
    debug: bool = False
    port: int = Field(default=3000, alias="PORT")

    # Google Gemini API Keys
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    google_api_key: str = Field(default="", alias="GOOGLE_API_KEY")
    gemini_base_url: str = Field(default="", alias="GEMINI_BASE_URL")

    # Model Configuration
    gemini_model: str = Field(default="gemini-3.5-flash-lite", alias="GEMINI_MODEL")
    gemini_embed_model: str = Field(default="gemini-embedding-001", alias="GEMINI_EMBED_MODEL")

    # Rate Limiting
    uploads_per_hour: int = Field(default=10, alias="UPLOADS_PER_HOUR")
    daily_uploads: int = Field(default=100, alias="DAILY_UPLOADS")
    questions_per_hour: int = Field(default=30, alias="QUESTIONS_PER_HOUR")
    daily_questions: int = Field(default=300, alias="DAILY_QUESTIONS")

    # Allowed CORS Origins
    allowed_origins_env: str = Field(default="", alias="ALLOWED_ORIGINS")

    @property
    def api_key(self) -> str:
        """Resolves the primary Gemini API key."""
        return self.gemini_api_key or self.google_api_key

    @property
    def allowed_origins(self) -> List[str]:
        """Combines base production origins with optional env-configured origins."""
        base = [
            "https://rag.anandpabbineedi.site",
            "http://localhost:5500",
            "http://127.0.0.1:5500",
            "http://localhost:5173",
        ]
        if self.allowed_origins_env:
            extra = [o.strip() for o in self.allowed_origins_env.split(",") if o.strip()]
            base.extend(extra)
        return list(dict.fromkeys(base))


@lru_cache
def get_settings() -> Settings:
    """Singleton getter for application settings."""
    return Settings()
