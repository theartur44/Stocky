# Imagen del servidor Stoky (fase futura). Usuario sin privilegios, sin caché de pip.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --system --uid 10001 --home-dir /srv stoky

COPY app ./app
USER stoky

EXPOSE 8000
# Detrás de un proxy inverso con TLS. --proxy-headers solo si el proxy es de confianza.
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
