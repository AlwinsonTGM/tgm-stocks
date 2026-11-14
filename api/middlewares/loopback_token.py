# -*- coding: utf-8 -*-
"""
Loopback token middleware: protect the on-device backend from other apps.

The Android app runs the backend on ``127.0.0.1`` on an OS-assigned port. Any
other app on the phone can reach that port, so the app generates a random
per-install secret (the Loopback token) and passes it to the backend in
``TGMS_LOOPBACK_TOKEN`` before the server starts.

When that variable is set, every request must present the token, either as the
``tgms_token`` cookie or as ``Authorization: Bearer <token>``. When it is unset
(desktop, tests) nothing changes and no token is required.

The token value is never logged.
"""

from __future__ import annotations

import hmac
import logging
import os
from typing import Callable, Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

LOOPBACK_TOKEN_ENV = "TGMS_LOOPBACK_TOKEN"
LOOPBACK_TOKEN_COOKIE = "tgms_token"
_BEARER_PREFIX = "bearer "


def get_loopback_token() -> Optional[str]:
    """Return the configured Loopback token, or None when the backend is unprotected."""
    token = os.getenv(LOOPBACK_TOKEN_ENV, "").strip()
    return token or None


def _presented_tokens(request: Request) -> list[str]:
    presented: list[str] = []
    cookie_value = request.cookies.get(LOOPBACK_TOKEN_COOKIE)
    if cookie_value:
        presented.append(cookie_value)
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith(_BEARER_PREFIX):
        presented.append(authorization[len(_BEARER_PREFIX):].strip())
    return [value for value in presented if value]


def _matches(presented: str, expected: str) -> bool:
    return hmac.compare_digest(presented.encode("utf-8"), expected.encode("utf-8"))


class LoopbackTokenMiddleware(BaseHTTPMiddleware):
    """Reject requests that do not carry the Loopback token when one is configured."""

    async def dispatch(self, request: Request, call_next: Callable):
        expected = get_loopback_token()
        if expected is None:
            return await call_next(request)

        if not any(_matches(value, expected) for value in _presented_tokens(request)):
            return JSONResponse(
                status_code=401,
                content={
                    "error": "loopback_token_required",
                    "message": "This backend requires the app's Loopback token",
                },
            )

        return await call_next(request)


def add_loopback_token_middleware(app) -> None:
    """Add the Loopback token middleware.

    Whether a token is enforced is decided per request from the environment, so
    a process that starts without one keeps its old behaviour.
    """
    app.add_middleware(LoopbackTokenMiddleware)
    if get_loopback_token() is not None:
        logger.info("Loopback token required on every request")
