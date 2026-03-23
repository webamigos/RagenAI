FROM ghcr.io/berriai/litellm:main-stable

COPY config.yaml /app/config.yaml

# Railway sets PORT dynamically — LiteLLM must listen on it
ENV PORT=4000

CMD ["sh", "-c", "exec litellm --config /app/config.yaml --port ${PORT}"]
