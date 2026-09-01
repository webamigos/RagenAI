FROM ghcr.io/docling-project/docling-serve-cpu:latest

COPY --chmod=755 entrypoint.sh /app/entrypoint.sh
COPY port-forward.py /app/port-forward.py

# Railway sets PORT dynamically — Docling must listen on it
ENV PORT=5001
# Enable UI by default for local/staging — override to "false" in production
ENV DOCLING_SERVE_ENABLE_UI=true
ENV DOCLING_SERVE_LOAD_MODELS_AT_BOOT=true
ENV DOCLING_SERVE_MAX_SYNC_WAIT=300
ENV DOCLING_NUM_THREADS=4

ENTRYPOINT []
CMD ["/app/entrypoint.sh"]
