"""Abuse protection for the public deployment (DESKFORGE_PUBLIC=1).

* AI calls (photo analysis, prompt edits) are rate-limited per visitor and per day,
  so a Claude key added to a public Space can't be drained by strangers.
* CAD builds are CPU-heavy, so at most N run at once; extra requests wait briefly
  and then get a friendly "busy" error instead of freezing the server.
"""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

from fastapi import Request

from .errors import AppError

PUBLIC = os.getenv("DESKFORGE_PUBLIC", "0") == "1"
AI_PER_IP_PER_HOUR = int(os.getenv("DESKFORGE_AI_PER_HOUR", "8"))
AI_PER_DAY = int(os.getenv("DESKFORGE_AI_PER_DAY", "150"))
CAD_PER_IP_PER_MIN = int(os.getenv("DESKFORGE_CAD_PER_MIN", "40"))
MAX_PARALLEL_CAD = int(os.getenv("DESKFORGE_MAX_PARALLEL_CAD", "2"))

_lock = threading.Lock()
_hits: dict[str, deque] = defaultdict(deque)
_cad_slots = threading.BoundedSemaphore(MAX_PARALLEL_CAD)


class RateLimitedError(AppError):
    status_code = 429
    code = "rate_limited"


class BusyError(AppError):
    status_code = 503
    code = "server_busy"


def client_ip(request: Request) -> str:
    # Hugging Face / most hosts put the real client first in X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check(key: str, limit: int, window_s: float) -> bool:
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True


def check_ai(request: Request) -> None:
    """Call before any paid/slow AI request. No-op when running locally."""
    if not PUBLIC:
        return
    if not _check("ai:day", AI_PER_DAY, 86400):
        raise RateLimitedError("The public demo's AI budget for today is used up.",
                               "Try the demo desk, or run DeskForge locally for free AI.")
    if not _check(f"ai:{client_ip(request)}", AI_PER_IP_PER_HOUR, 3600):
        raise RateLimitedError("You've reached the AI limit for this hour on the public demo.",
                               "Use the sliders (unlimited), or run DeskForge locally.")


def check_cad(request: Request) -> None:
    if PUBLIC and not _check(f"cad:{client_ip(request)}", CAD_PER_IP_PER_MIN, 60):
        raise RateLimitedError("Too many rebuilds - slow down for a moment.",
                               "The model rebuilds automatically when you pause.")


class cad_slot:
    """Context manager limiting concurrent CAD builds (always on - also protects laptops)."""

    def __enter__(self):
        if not _cad_slots.acquire(timeout=25):
            raise BusyError("The CAD engine is busy with other builds.", "Try again in a few seconds.")
        return self

    def __exit__(self, *exc):
        _cad_slots.release()
        return False
