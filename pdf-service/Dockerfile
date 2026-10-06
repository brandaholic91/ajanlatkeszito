# A Microsoft hivatalos Playwright-képe: benne van a Chromium és minden, ami a futtatásához kell.
# A verziónak egyeznie kell a uv.lock-ban lévő playwright csomag verziójával.
FROM mcr.microsoft.com/playwright/python:v1.63.0-noble

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app

# Előbb csak a függőségek: így a kód módosítása után nem telepít újra mindent.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY main.py ./
COPY templates ./templates

EXPOSE 8000
CMD ["uv", "run", "--no-dev", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
