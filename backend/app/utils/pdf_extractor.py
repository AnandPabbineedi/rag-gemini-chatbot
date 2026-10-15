"""Extracts raw text from PDF and TXT file uploads using pypdf."""

import io
from fastapi import HTTPException
import pypdf


def extract_text_from_file(content_bytes: bytes, mime_type: str) -> str:
    """
    Extracts text from uploaded PDF or plain text bytes.

    Raises:
        HTTPException: On encrypted PDFs or empty/scanned files.
    """
    if mime_type == "text/plain":
        try:
            return content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return content_bytes.decode("latin-1", errors="replace")

    if mime_type == "application/pdf":
        try:
            reader = pypdf.PdfReader(io.BytesIO(content_bytes))
            if reader.is_encrypted:
                raise HTTPException(
                    status_code=400,
                    detail="This PDF is password-protected. Remove the password and try again.",
                )

            extracted_pages = []
            for page in reader.pages:
                page_text = page.extract_text() or ""
                if page_text.strip():
                    extracted_pages.append(page_text.strip())

            return "\n\n".join(extracted_pages)
        except HTTPException:
            raise
        except Exception as exc:
            if "password" in str(exc).lower() or "encrypt" in str(exc).lower():
                raise HTTPException(
                    status_code=400,
                    detail="This PDF is password-protected. Remove the password and try again.",
                )
            raise HTTPException(
                status_code=400,
                detail="Couldn't read this file. Try a different PDF or TXT.",
            )

    raise HTTPException(status_code=400, detail="Only PDF and TXT files are allowed.")
