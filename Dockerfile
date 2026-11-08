# syntax=docker/dockerfile:1
# MusclePro — one container: Vite build served by Flask/Gunicorn.

# ---- 1. Build the front-end (Vite + TypeScript + Three.js) ----------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. Python runtime (Flask API + static files) -------------------------
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    APP_ENV=production \
    STATIC_DIR=/app/frontend/dist

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist /app/frontend/dist

RUN useradd --create-home --uid 10001 musclepro
USER musclepro

# Render injects $PORT (10000 by default).
EXPOSE 10000
# One worker by default (fits the 512 MB free plan; raise WEB_CONCURRENCY
# only when Firebase is configured, since the fallback store is per-process).
CMD ["sh", "-c", "exec gunicorn wsgi:app --bind 0.0.0.0:${PORT:-10000} --workers ${WEB_CONCURRENCY:-1} --threads 8 --timeout 60 --access-logfile -"]
