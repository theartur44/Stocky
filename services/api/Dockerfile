# Imagen del servidor Stocky: usuario sin privilegios, sin caché de pip ni compiladores.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --system --uid 10001 --home-dir /srv --shell /usr/sbin/nologin stocky

COPY --chown=root:root alembic.ini docker-entrypoint.sh ./
COPY --chown=root:root migrations ./migrations
COPY --chown=root:root app ./app
RUN chmod 755 docker-entrypoint.sh

USER stocky
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; r=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8000/api/v1/ready', headers={'Host':'localhost'}), timeout=4); sys.exit(0 if r.status==200 else 1)"

ENTRYPOINT ["./docker-entrypoint.sh"]
