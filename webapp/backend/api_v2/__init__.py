"""The /api/v2 API. Additive only: v1 endpoints in app.py keep their shapes (ADR 0001)."""
from api_v2.learn_routes import router as learn_router
from api_v2.live_routes import router as live_router
from api_v2.phase4_routes import router as phase4_router
from api_v2.phase5_routes import router as phase5_router
from api_v2.scan_routes import router as scan_router
from api_v2.routes import router

__all__ = ["router", "live_router", "phase4_router", "phase5_router", "scan_router", "learn_router"]
