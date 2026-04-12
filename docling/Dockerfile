FROM ghcr.io/docling-project/docling-serve-cpu:latest

# Install socat for IPv4→IPv6 port forwarding (Railway networking)
RUN apt-get update -qq && apt-get install -y -qq socat > /dev/null 2>&1 && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Railway sets PORT dynamically — Docling must listen on it
ENV PORT=5001
# Enable UI by default for local/staging — override to "false" in production
ENV DOCLING_SERVE_ENABLE_UI=true
ENV DOCLING_SERVE_LOAD_MODELS_AT_BOOT=true
ENV DOCLING_SERVE_MAX_SYNC_WAIT=300
ENV DOCLING_NUM_THREADS=4

ENTRYPOINT []
CMD ["/app/entrypoint.sh"]
