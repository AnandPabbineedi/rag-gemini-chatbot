"""Thread-safe asynchronous rate limiter for RAG API."""

import asyncio
import time
from typing import Dict, List, Tuple


class RateLimiter:
    """In-memory sliding window rate limiter."""

    def __init__(self, hourly_limit_per_ip: int, daily_limit: int, scope_name: str = "request") -> None:
        self.hourly_limit = hourly_limit_per_ip
        self.daily_limit = daily_limit
        self.scope_name = scope_name
        self.hourly_window = 3600.0
        self.daily_window = 86400.0

        self._ip_history: Dict[str, List[float]] = {}
        self._daily_history: List[float] = []
        self._lock = asyncio.Lock()

    async def check(self, client_ip: str) -> Tuple[bool, str]:
        """Validates request against hourly and daily quotas."""
        now = time.time()
        async with self._lock:
            # Check global daily cap
            self._daily_history = [t for t in self._daily_history if now - t < self.daily_window]
            if len(self._daily_history) >= self.daily_limit:
                return False, f"Today's free {self.scope_name} limit is used up. Please try again tomorrow."

            # Check per-IP hourly limit
            history = self._ip_history.get(client_ip, [])
            history = [t for t in history if now - t < self.hourly_window]
            self._ip_history[client_ip] = history

            if len(history) >= self.hourly_limit:
                return False, f"You've reached the hourly {self.scope_name} limit for this demo. Try again in a bit."

            self._ip_history[client_ip].append(now)
            self._daily_history.append(now)
            return True, ""
