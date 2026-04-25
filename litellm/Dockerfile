FROM ghcr.io/berriai/litellm:v1.83.3-stable

# Install socat for IPv4→IPv6 port forwarding
RUN apk add --no-cache socat

COPY config.yaml /app/config.yaml
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Railway sets PORT dynamically — LiteLLM must listen on it
ENV PORT=4000

ENTRYPOINT []
CMD ["/app/entrypoint.sh"]
