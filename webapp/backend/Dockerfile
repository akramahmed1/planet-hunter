FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py schemas.py data_store.py db.py security_mw.py export_openapi.py seed_demo_scans.py alembic.ini jsonlog.py logging.json ./
COPY api_v2/ ./api_v2/
COPY live/ ./live/
COPY pipeline/ ./pipeline/
COPY scans/ ./scans/
COPY learn/ ./learn/
COPY classroom/ ./classroom/
COPY explain/ ./explain/
COPY watch/ ./watch/
COPY billing/ ./billing/
COPY mailer/ ./mailer/
COPY content/ ./content/
COPY migrations/ ./migrations/
COPY data/ ./data/
COPY plots/ ./plots/

RUN useradd --create-home --uid 10001 app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/health')" || exit 1
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --log-config logging.json"]
