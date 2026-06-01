FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gcc g++ && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 1001 genesis \
 && useradd --uid 1001 --gid genesis --shell /sbin/nologin --no-create-home genesis

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

COPY pyproject.toml ./
COPY src/ ./src/

RUN pip install --no-cache-dir --no-build-isolation -e . \
 && chown -R genesis:genesis /app

USER genesis

EXPOSE 8000

CMD ["sh", "-c", "python -m uvicorn genesis_swarm.api.cloud_app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
