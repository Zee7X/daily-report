FROM python:3.12-slim-bookworm

WORKDIR /worker
ENV PYTHONUNBUFFERED=1 \
    WORKER_HOST=0.0.0.0 \
    WORKER_PORT=3100

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && python -m playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

COPY main.py .

EXPOSE 3100
CMD ["python", "main.py"]
