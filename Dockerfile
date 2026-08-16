FROM python:3.12-slim

# No build tooling, no compiler: everything here is pure Python + SQLite (stdlib).
RUN pip install --no-cache-dir fastapi uvicorn

WORKDIR /app
COPY app/ /app/

# One volume holds the whole state — the database. Nothing else is persisted.
VOLUME ["/data"]
ENV DB_PATH=/data/calendar.db \
    PORT=8090 \
    LANG_UI=en \
    FIRST_WEEKDAY=0
EXPOSE 8090

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,os,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",8090)}/healthz',timeout=4).status==200 else 1)"

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8090}"]
