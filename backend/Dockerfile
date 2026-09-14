FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SHOSHOLOZA_ENV=production \
    SHOSHOLOZA_DATABASE_URL=sqlite:////data/shosholoza.db

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt

COPY app ./app
RUN mkdir -p /data && useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /data

USER appuser
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]

