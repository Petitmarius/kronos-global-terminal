# KRONOS Global Terminal — one container serves the API, the websocket and the
# built frontend. The frontend only ever calls relative paths and derives its
# websocket URL from `location.host`, so same-origin serving means there is no
# API base to configure and no CORS exchange anywhere.

# ---- build the frontend --------------------------------------------------
FROM node:24-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
# `ci` (not `install --omit=dev`): `npm run build` runs tsc, a devDependency.
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- runtime ------------------------------------------------------------
FROM python:3.13-slim

# Hugging Face Spaces runs the container as uid 1000, so the user has to exist
# before anything is copied in -- otherwise pip and every COPY land root-owned
# and the container dies on "permission denied". Harmless on any other host.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1
WORKDIR $HOME/app

COPY --chown=user backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user backend/ ./
# `main.py` mounts this directory at / when it exists.
COPY --from=web --chown=user /web/dist ./static

# 7860 is what Spaces routes to (`app_port` in the README front matter); PORT
# covers hosts that inject one instead (Render, Fly, Cloud Run).
ENV PORT=7860
EXPOSE 7860
CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
