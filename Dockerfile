# Created by Caleb M. Irvine for use by Moto Reloaded
# Lean CPU-only container for Azure Container Apps (scale-to-zero portfolio deployment).
# Confidential data/, refs.npy, .agents/, and .env are strictly excluded via .dockerignore.

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hf_cache \
    TORCH_HOME=/opt/torch_cache \
    INTAKE_DB_PATH=/tmp/moto-runtime/intake.db \
    INTAKE_UPLOADS_DIR=/tmp/moto-runtime/uploads \
    PORT=8000

WORKDIR /app

# Minimal native runtime libs for Pillow JPEG/PNG decoding, OpenMP, and healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
        libjpeg62-turbo \
        zlib1g \
        libgomp1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Fast dependency installation via uv binary
COPY --from=ghcr.io/astral-sh/uv:0.6 /uv /usr/local/bin/uv

# 1. Install CPU-only PyTorch & Torchvision first (~2 GB smaller than CUDA wheels)
RUN uv pip install --system --no-cache \
        --index-url https://download.pytorch.org/whl/cpu \
        "torch>=2.4.0" \
        "torchvision>=0.19.0"

# 2. Install FastAPI, OpenCLIP, Azure OpenAI SDK, and runtime utilities
RUN uv pip install --system --no-cache \
        "fastapi>=0.115.0" \
        "uvicorn[standard]>=0.32.0" \
        "python-multipart>=0.0.12" \
        "open-clip-torch>=2.29.0" \
        "numpy>=1.26.0" \
        "pillow>=10.4.0" \
        "openai>=1.55.0" \
        "python-dotenv>=1.0.1" \
        "pydantic>=2.9.0" \
        "qrcode[pil]>=8.0" \
        "openpyxl>=3.1.5" \
    && python -c "import torch; assert not torch.version.cuda, f'Expected CPU-only torch, got CUDA {torch.version.cuda}'"

# 3. Pre-download frozen pretrained OpenCLIP ViT-B-32 (laion2b_s34b_b79k) into /opt/hf_cache
#    (Inference-only, zero training; eliminates ~600 MB download on scale-to-zero cold starts)
COPY scripts/prefetch_clip.py /app/scripts/prefetch_clip.py
RUN mkdir -p /opt/hf_cache /opt/torch_cache \
    && python /app/scripts/prefetch_clip.py

# Lock Hugging Face Hub to offline cache at runtime for fast, deterministic cold starts
ENV HF_HUB_OFFLINE=1

# 4. Copy application source only (no data/, refs.npy, .env, or .agents/)
COPY app /app/app

# 5. Run as non-root user with writable ephemeral /tmp/moto-runtime
RUN useradd --create-home --shell /bin/bash appuser \
    && mkdir -p /tmp/moto-runtime/uploads \
    && chown -R appuser:appuser /app /tmp/moto-runtime \
    && chmod -R a+rX /opt/hf_cache /opt/torch_cache

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
