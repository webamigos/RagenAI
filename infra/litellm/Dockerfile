FROM ghcr.io/berriai/litellm:v1.99.1

# Install socat for IPv4→IPv6 port forwarding
RUN apk add --no-cache socat

COPY infra/litellm/config.yaml /app/config.yaml
COPY infra/litellm/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Railway sets PORT dynamically — LiteLLM must listen on it
ENV PORT=4000

ENTRYPOINT []
CMD ["/app/entrypoint.sh"]
