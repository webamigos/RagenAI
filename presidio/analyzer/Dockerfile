FROM mcr.microsoft.com/presidio-analyzer@sha256:286e3fa7f3a7426e775e8564fe1870f1ba8f999d3ab8bbb8cc46a44355d9d6e9

RUN pip install --no-cache-dir \
    https://github.com/explosion/spacy-models/releases/download/pl_core_news_md-3.8.0/pl_core_news_md-3.8.0-py3-none-any.whl

WORKDIR /app

# Rename original app.py so our custom app.py can import it as _presidio_app
RUN mv /app/app.py /app/_presidio_app.py

COPY recognizers/ /app/recognizers/
COPY app.py /app/app.py
COPY conf/nlp.yaml /app/presidio_analyzer/conf/default.yaml
COPY conf/analyzer.yaml /app/presidio_analyzer/conf/default_analyzer.yaml
COPY conf/recognizers.yaml /app/presidio_analyzer/conf/default_recognizers.yaml

ENV RECOGNIZERS_PATH=/app/recognizers

# Bind to [::] only — Linux dual-stack sockets (IPV6_V6ONLY=0 by default)
# accept IPv4 connections via IPv4-mapped addresses on the same socket, so
# we don't need a separate 0.0.0.0 bind. Adding both makes the IPv6 bind
# collide with the IPv4 one on the same port (Address already in use).
CMD ["sh", "-c", "poetry run gunicorn -w \"${WORKERS:-1}\" -b \"[::]:${PORT:-3000}\" \"app:create_app()\""]

EXPOSE 3000
