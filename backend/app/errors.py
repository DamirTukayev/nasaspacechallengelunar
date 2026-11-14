"""Error responses that stay valid JSON whatever the client sent."""

import math
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _finite(value: Any) -> Any:
    """JSON has no NaN or Infinity; echo such inputs back as text."""
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {key: _finite(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_finite(item) for item in value]
    return value


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """FastAPI's default handler, except that a NaN in the body gives 422, not a crash."""
    return JSONResponse(
        status_code=422, content={"detail": _finite(jsonable_encoder(exc.errors()))}
    )
