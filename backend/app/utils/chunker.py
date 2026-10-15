"""Sentence-aware text chunking with overlapping windows."""

import re
from typing import List

TARGET_CHUNK_SIZE = 1500
CHUNK_OVERLAP = 200


def chunk_text(
    text: str,
    target_size: int = TARGET_CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> List[str]:
    """
    Splits text into overlapping chunks, preferring natural sentence boundaries.
    
    Args:
        text: The source text to split.
        target_size: Target character length per chunk (~1500 chars).
        overlap: Character overlap between consecutive chunks (~200 chars).

    Returns:
        List of cleaned chunk strings.
    """
    clean = re.sub(r"\r\n?", "\n", text).strip()
    if not clean:
        return []

    if len(clean) <= target_size:
        return [clean]

    # Split into sentences or paragraph breaks
    segments = re.split(r"(?<=[.!?])\s+|\n+", clean)
    segments = [s.strip() for s in segments if s.strip()]

    chunks: List[str] = []
    current_chunk: List[str] = []
    current_len = 0

    for seg in segments:
        seg_len = len(seg)
        # If single segment is huge, split it by characters
        if seg_len > target_size:
            if current_chunk:
                chunks.append(" ".join(current_chunk))
                current_chunk = []
                current_len = 0
            for i in range(0, len(seg), target_size - overlap):
                sub = seg[i : i + target_size].strip()
                if sub:
                    chunks.append(sub)
            continue

        if current_len + seg_len + 1 > target_size and current_chunk:
            chunk_str = " ".join(current_chunk)
            chunks.append(chunk_str)

            # Build overlap from the end of the current chunk
            overlap_segments: List[str] = []
            overlap_len = 0
            for prev_seg in reversed(current_chunk):
                if overlap_len + len(prev_seg) + 1 <= overlap:
                    overlap_segments.insert(0, prev_seg)
                    overlap_len += len(prev_seg) + 1
                else:
                    break
            current_chunk = overlap_segments
            current_len = sum(len(s) for s in current_chunk) + len(current_chunk)

        current_chunk.append(seg)
        current_len += seg_len + 1

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return [c.strip() for c in chunks if c.strip()]
