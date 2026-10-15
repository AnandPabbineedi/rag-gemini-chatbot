"""Main FastAPI application for Ask Your Documents (RAG Gemini Chatbot)."""

from contextlib import asynccontextmanager
import logging
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.routes import router as rag_router
from .config import Settings, get_settings
from .schemas.rag import HealthStatusResponse
from .services.model_manager import get_available_least_models

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("rag_chatbot")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context."""
    settings = get_settings()
    logger.info("Starting %s v%s...", settings.app_name, settings.app_version)
    yield
    logger.info("Shutting down %s...", settings.app_name)


app = FastAPI(
    title="Ask Your Documents - RAG API",
    version="2.0.0",
    description="Retrieval-Augmented Generation chatbot grounded on uploaded PDF/TXT files using Google Gemini.",
    lifespan=lifespan,
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*\.anandpabbineedi\.site",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-AI-Model-Used"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Ensures all HTTP exceptions return standard {'error': detail} schema."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Returns readable error message on schema validation failure."""
    logger.warning("Validation error on %s: %s", request.url.path, exc.errors())
    errors = exc.errors()
    msg = errors[0].get("msg") if errors else "Invalid request parameters."
    field = ".".join(str(loc) for loc in errors[0].get("loc", [])) if errors else ""
    detail = f"Invalid request: {field} - {msg}" if field else f"Invalid request: {msg}"
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": detail},
    )


@app.get(
    "/",
    response_model=HealthStatusResponse,
    summary="Health check and available model report",
)
async def root_health(settings: Settings = Depends(get_settings)):
    """Health check endpoint reporting server status and available Gemini models."""
    available_models = await get_available_least_models(settings.api_key)
    return HealthStatusResponse(
        status="ok",
        preferredModel=settings.gemini_model,
        availableFallbackModels=available_models,
    )


# Mount the API router
app.include_router(rag_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
