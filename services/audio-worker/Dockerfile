# Tunewick audio worker. Debian ffmpeg is built with libsoxr (high-quality resampling) and
# libmp3lame (used only by tests to fabricate lossy-origin fixtures).
FROM python:3.13-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .
RUN useradd --create-home worker
USER worker
ENTRYPOINT ["python", "-m", "tunewick_audio"]

FROM base AS test
USER root
RUN pip install --no-cache-dir ".[dev]"
COPY tests ./tests
RUN chown -R worker /app
USER worker
ENTRYPOINT []
CMD ["sh", "-c", "ruff check src tests && ruff format --check src tests && pytest -q"]

# Default build target: the production image.
FROM base AS production
