# DeskForge - one container serving the website, the API and the CAD engine.
# Built automatically by Hugging Face Spaces (sdk: docker, port 7860).

# ---------- 1. build the React website ----------
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
# A lockfile made on Windows can miss Linux-only optional binaries (npm bug #4828),
# so fall back to a fresh resolve if `npm ci` fails.
RUN npm ci --no-audit --no-fund || (rm -f package-lock.json && npm install --no-audit --no-fund)
COPY frontend/ ./
RUN npm run build

# ---------- 2. Python runtime with CadQuery ----------
FROM python:3.11-slim

# OpenCascade (CadQuery's kernel) needs these system libraries; DejaVu supplies a
# font for engraved labels and front text.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglu1-mesa libxrender1 libxext6 libsm6 libglib2.0-0 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face runs containers as uid 1000.
RUN useradd -m -u 1000 user
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY --chown=user backend/ backend/
COPY --from=web --chown=user /web/dist frontend/dist

USER user
ENV PORT=7860 \
    DESKFORGE_PUBLIC=1 \
    PYTHONUNBUFFERED=1
EXPOSE 7860

CMD ["sh", "-c", "python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT}"]
