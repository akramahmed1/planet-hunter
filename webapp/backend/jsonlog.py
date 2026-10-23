"""One JSON object per log line, on stdout. Railway reads `level` and `message`.

uvicorn writes its normal startup lines to stderr, which Railway marks as errors; with this
formatter on stdout they are `info` and only real errors are `error`.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "level": record.levelname.lower().replace("warning", "warn"),
            "message": record.getMessage(),
            "logger": record.name,
            "time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
        }
        if record.exc_info:
            out["exception"] = self.formatException(record.exc_info)
        return json.dumps(out, ensure_ascii=False)
