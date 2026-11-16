"""Typed application errors and FastAPI handlers.

Every failure the frontend can see is shaped as:
    {"error": {"code": "...", "message": "...", "hint": "..."}}
so the UI can show a friendly toast instead of a stack trace.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("deskforge")


class AppError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str, hint: str | None = None, *, code: str | None = None,
                 status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.hint = hint
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class InvalidImageError(AppError):
    status_code = 400
    code = "invalid_image"


class VisionError(AppError):
    status_code = 502
    code = "vision_failed"


class VisionAuthError(AppError):
    status_code = 401
    code = "vision_auth"


class VisionRateLimitError(AppError):
    status_code = 429
    code = "vision_rate_limited"


class GenerationError(AppError):
    status_code = 500
    code = "generation_failed"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


def _payload(code: str, message: str, hint: str | None = None) -> dict:
    return {"error": {"code": code, "message": message, "hint": hint}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        log.warning("%s: %s", exc.code, exc.message)
        return JSONResponse(status_code=exc.status_code,
                            content=_payload(exc.code, exc.message, exc.hint))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        msg = f"{where}: {first.get('msg', 'invalid value')}" if where else "Invalid request"
        return JSONResponse(status_code=422,
                            content=_payload("invalid_request", msg,
                                             "Check the slider values are within range."))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("Unhandled error")
        return JSONResponse(status_code=500,
                            content=_payload("internal_error", "Something went wrong on the server.",
                                             str(exc)[:200]))
