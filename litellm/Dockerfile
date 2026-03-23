FROM ghcr.io/berriai/litellm:main-stable

COPY config.yaml /app/config.yaml

# Railway sets PORT dynamically — LiteLLM must listen on it
ENV PORT=4000

ENTRYPOINT []
# Bind to :: (IPv6 all interfaces) — also accepts IPv4 connections on dual-stack systems.
# Required for Railway internal networking which uses IPv6.
CMD ["sh", "-c", "litellm --config /app/config.yaml --host '::' --port ${PORT}"]
