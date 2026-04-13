# ============================================
# VoiceFlow AI SaaS - Multi-stage Dockerfile
# ============================================

# ── Stage 1: Frontend build ──────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --prefer-offline
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend ─────────────────
FROM python:3.11-slim-bookworm AS backend

# System dependencies for audio processing + PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    libpq-dev \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY src/ ./src/
COPY billing_service.py .
COPY run.sh .

# Copy built frontend into static/
COPY --from=frontend-build /app/frontend/dist ./static/

# Create data directories
RUN mkdir -p data/recordings data/voices logs

# Environment defaults
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    APP_ENV=production \
    PORT=8001

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]
