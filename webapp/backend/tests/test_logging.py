"""uvicorn's normal lines go to stdout as JSON `info`; real errors stay `error` (Railway reads `level`)."""
import json
import logging
import logging.config
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def test_logging_config_writes_json_to_stdout(capfd):
    cfg = json.loads((BACKEND / "logging.json").read_text())
    logging.config.dictConfig(cfg)
    try:
        logging.getLogger("uvicorn.error").info("Uvicorn running on http://0.0.0.0:8000")
        try:
            raise ValueError("on purpose")
        except ValueError:
            logging.getLogger("planet-hunter").exception("boom")
        out, err = capfd.readouterr()
    finally:
        logging.getLogger().handlers.clear()
    assert err == ""
    lines = [json.loads(x) for x in out.splitlines()]
    assert lines[0]["level"] == "info" and lines[0]["message"].startswith("Uvicorn running")
    assert lines[1]["level"] == "error" and "ValueError: on purpose" in lines[1]["exception"]


def test_dockerfile_uses_the_log_config():
    text = (BACKEND / "Dockerfile").read_text()
    assert "--log-config logging.json" in text and "jsonlog.py" in text and "logging.json" in text.split("COPY app.py")[1]


def test_api_keys_in_logged_urls_are_redacted(capfd):
    cfg = json.loads((BACKEND / "logging.json").read_text())
    logging.config.dictConfig(cfg)
    try:
        logging.getLogger("httpx").info(
            'HTTP Request: GET https://api.nasa.gov/planetary/apod?date=2026-10-26&api_key=SECRETVALUE123 "HTTP/1.1 200 OK"')
        logging.getLogger("httpx").info("GET https://x.test/a?token=abc&b=1")
        out, _ = capfd.readouterr()
    finally:
        logging.getLogger().handlers.clear()
    assert "SECRETVALUE123" not in out and "token=abc" not in out
    lines = [json.loads(x) for x in out.splitlines()]
    assert "api_key=[redacted]" in lines[0]["message"] and "date=2026-10-26" in lines[0]["message"]
    assert lines[1]["message"].endswith("token=[redacted]&b=1")
