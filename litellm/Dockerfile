FROM ghcr.io/berriai/litellm:main-stable

COPY config.yaml /app/config.yaml

# Railway sets PORT dynamically — LiteLLM must listen on it
ENV PORT=4000

ENTRYPOINT []
# Bind to :: (dual-stack: accepts both IPv6 and IPv4)
# Required for Railway internal networking which resolves to IPv6
CMD ["sh", "-c", "litellm --config /app/config.yaml --host '::' --port ${PORT}"]
