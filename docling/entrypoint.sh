#!/bin/sh
set -e

# Docling runs on an internal port.
# Python port forwarder listens on $PORT for both IPv4 and IPv6,
# forwarding to Docling. This enables Railway's IPv6 internal
# networking AND IPv4 public access.

DOCLING_PORT=$((PORT + 1))

# Start port forwarder in background (Python — always available in the image)
python /app/port-forward.py ${PORT} ${DOCLING_PORT} &

# Start Docling on localhost only (internal port)
# create_app is a factory function, so --factory is required
exec uvicorn docling_serve.app:create_app --factory --host 127.0.0.1 --port ${DOCLING_PORT}
