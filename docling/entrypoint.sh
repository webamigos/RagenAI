#!/bin/sh
set -e

# Docling runs on an internal port.
# socat listens on $PORT for both IPv4 and IPv6, forwarding to Docling.
# This enables Railway's IPv6 internal networking AND IPv4 public access.

DOCLING_PORT=$((PORT + 1))

# Forward IPv4 traffic on $PORT → Docling
socat TCP4-LISTEN:${PORT},fork,reuseaddr TCP4:127.0.0.1:${DOCLING_PORT} &

# Forward IPv6 traffic on $PORT → Docling
socat TCP6-LISTEN:${PORT},fork,reuseaddr,ipv6only=1 TCP4:127.0.0.1:${DOCLING_PORT} &

# Start Docling on localhost only (internal port)
exec uvicorn docling_serve.app:app --host 127.0.0.1 --port ${DOCLING_PORT}
