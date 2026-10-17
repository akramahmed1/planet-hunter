"""The /api/v2 API. Additive only: v1 endpoints in app.py keep their shapes (ADR 0001)."""
from api_v2.routes import router

__all__ = ["router"]
