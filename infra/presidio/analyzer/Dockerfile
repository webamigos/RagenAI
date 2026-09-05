# Presidio moved from Microsoft to the independent Data Privacy Stack org
# (github.com/data-privacy-stack/presidio) — mcr.microsoft.com/presidio-* is
# now a frozen legacy registry that stopped receiving new releases. This is
# the index digest (multi-platform manifest list, same shape as the previous
# pin) for ghcr.io/data-privacy-stack/presidio-analyzer:2.2.364.
FROM ghcr.io/data-privacy-stack/presidio-analyzer@sha256:ae8f6f111ac2f04e3fec552f7f80edd0dcbfa2dd69ee1b9e030475be31669885

RUN pip install --no-cache-dir \
    https://github.com/explosion/spacy-models/releases/download/pl_core_news_lg-3.8.0/pl_core_news_lg-3.8.0-py3-none-any.whl

WORKDIR /app

# Rename original app.py so our custom app.py can import it as _presidio_app
RUN mv /app/app.py /app/_presidio_app.py

COPY recognizers/ /app/recognizers/
COPY data/first_names.txt /app/recognizers/data/first_names.txt
COPY data/last_names.txt /app/recognizers/data/last_names.txt
COPY app.py /app/app.py
COPY conf/nlp.yaml /app/presidio_analyzer/conf/default.yaml
COPY conf/analyzer.yaml /app/presidio_analyzer/conf/default_analyzer.yaml
COPY conf/recognizers.yaml /app/presidio_analyzer/conf/default_recognizers.yaml

ENV RECOGNIZERS_PATH=/app/recognizers

# Bind to [::] only — Linux dual-stack sockets (IPV6_V6ONLY=0 by default)
# accept IPv4 connections via IPv4-mapped addresses on the same socket, so
# we don't need a separate 0.0.0.0 bind. Adding both makes the IPv6 bind
# collide with the IPv4 one on the same port (Address already in use).
#
# No more `poetry run` — the base image switched from Poetry to uv as of the
# Data Privacy Stack fork, installing dependencies straight into the system
# Python (`uv sync ... --no-install-project`) rather than a Poetry-managed
# venv. gunicorn is on PATH directly now; the base image's own default
# entrypoint.sh confirms this (`exec gunicorn -w "$WORKERS" -b "0.0.0.0:$PORT" ...`).
CMD ["sh", "-c", "gunicorn -w \"${WORKERS:-1}\" -b \"[::]:${PORT:-3000}\" \"app:create_app()\""]

EXPOSE 3000
