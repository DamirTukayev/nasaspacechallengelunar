# Backend image for the live demo (Render) or any container host.
# Build from backend/:  docker build -t lunar-api backend
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# The LOLA DEM goes into its own layer before the code, so code changes don't re-download it.
# ldem_75s_120m is 116 MB; pass --build-arg DEM_NAME=ldem_75s_240m for a 29 MB image layer.
ARG DEM_NAME=ldem_75s_120m
ENV DEM_NAME=${DEM_NAME}
COPY app/__init__.py app/config.py app/
COPY app/terrain app/terrain
COPY app/scripts app/scripts
RUN python -m app.scripts.fetch_dem "${DEM_NAME}"

COPY app app

# Render and most hosts pass the port in $PORT.
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
