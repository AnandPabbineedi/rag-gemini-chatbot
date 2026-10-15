"""Dynamic model discovery and least-token fallback for RAG Chatbot."""

import logging
import time
from typing import Any, Dict, List, Optional
import httpx
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

TOKEN_RANKED_MODELS: List[str] = [
    "gemini-3.5-flash-lite",          # Lowest token cost & compute footprint, high throughput
    "gemini-flash-lite-latest",      # Alias for latest flash-lite
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",              # Standard fast multimodal model
    "gemini-3-flash-preview",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash",
    "gemini-2.5-pro",
    "gemini-pro-latest",
]

_cached_available_models: Optional[List[str]] = None
_last_cache_time: float = 0.0
CACHE_TTL_SECONDS: float = 1800.0  # 30 minutes


async def get_available_least_models(api_key: str) -> List[str]:
    """Dynamically queries Google Generative Language API to detect active models."""
    global _cached_available_models, _last_cache_time
    now = time.time()

    if _cached_available_models and (now - _last_cache_time < CACHE_TTL_SECONDS):
        return _cached_available_models

    if not api_key:
        return TOKEN_RANKED_MODELS

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.get(url)
            if res.status_code == 200:
                data = res.json()
                models = data.get("models", [])
                active_set = {
                    m.get("name", "").replace("models/", "")
                    for m in models
                    if "generateContent" in m.get("supportedGenerationMethods", [])
                }
                available = [m for m in TOKEN_RANKED_MODELS if m in active_set]
                if available:
                    _cached_available_models = available
                    _last_cache_time = now
                    logger.info("Dynamically detected %d available Gemini models: %s", len(available), available)
                    return available
    except Exception as exc:
        logger.warning("Could not fetch dynamic model list (%s). Using ranked default list.", exc)

    return TOKEN_RANKED_MODELS


async def generate_content_with_dynamic_fallback(
    client: genai.Client,
    api_key: str,
    contents: Any,
    preferred_model: Optional[str] = None,
    config: Optional[types.GenerateContentConfig] = None,
) -> Dict[str, Any]:
    """
    Executes generate_content across least-token models with automatic fallback
    on high demand spikes (503), quota limits (429), or deprecated models (404).
    """
    available_models = await get_available_least_models(api_key)

    candidates: List[str] = []
    if preferred_model and preferred_model not in candidates:
        candidates.append(preferred_model)

    for m in available_models:
        if m not in candidates:
            candidates.append(m)

    last_error: Optional[Exception] = None

    for model_name in candidates:
        try:
            logger.info("Generating answer with model: %s...", model_name)
            response = await client.aio.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )
            logger.info("Successfully generated answer using model: %s", model_name)
            return {
                "text": response.text,
                "model_used": model_name,
            }
        except Exception as exc:
            last_error = exc
            err_msg = str(exc)
            logger.warning(
                "Model %s failed: %s. Falling back to next available least-token model...",
                model_name,
                err_msg,
            )

            # Do not retry on safety violations as safety filters flag content itself
            if "SAFETY" in err_msg.upper():
                raise exc

    if last_error:
        raise last_error
    raise RuntimeError("All AI models are currently unavailable.")
