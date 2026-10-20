"""Limitación de peticiones en memoria (ventana deslizante).

Es por proceso: con varios procesos o réplicas, cada uno lleva su cuenta. Para
un servidor doméstico con un proceso basta; Caddy añade otra capa delante.
"""

from __future__ import annotations

import threading
import time
from collections import deque


class RateLimiter:
    def __init__(self, max_keys: int = 50_000) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._max_keys = max_keys

    def hit(self, key: str, limit: int, window_seconds: float) -> float | None:
        """Registra un intento. Devuelve los segundos de espera si se supera el límite."""
        now = time.monotonic()
        with self._lock:
            q = self._hits.get(key)
            if q is None:
                if len(self._hits) >= self._max_keys:
                    self._evict(now, window_seconds)
                q = self._hits[key] = deque()
            while q and now - q[0] > window_seconds:
                q.popleft()
            if len(q) >= limit:
                return max(1.0, window_seconds - (now - q[0]))
            q.append(now)
            return None

    def _evict(self, now: float, window: float) -> None:
        for k in [k for k, q in self._hits.items() if not q or now - q[-1] > window]:
            del self._hits[k]
        if len(self._hits) >= self._max_keys:
            self._hits.clear()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
