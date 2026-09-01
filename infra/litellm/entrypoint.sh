#!/bin/sh
set -e

# LiteLLM runs on an internal port.
# socat listens on $PORT for both IPv4 and IPv6, forwarding to LiteLLM.
# This enables Railway's IPv6 internal networking AND IPv4 public access.

LITELLM_PORT=$((PORT + 1))

# Forward IPv4 traffic on $PORT → LiteLLM
socat TCP4-LISTEN:${PORT},fork,reuseaddr TCP4:127.0.0.1:${LITELLM_PORT} &

# Forward IPv6 traffic on $PORT → LiteLLM
socat TCP6-LISTEN:${PORT},fork,reuseaddr,ipv6only=1 TCP4:127.0.0.1:${LITELLM_PORT} &

# Start LiteLLM on localhost only (internal port)
exec litellm --config /app/config.yaml --host 127.0.0.1 --port ${LITELLM_PORT}
