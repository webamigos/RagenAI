FROM ghcr.io/docling-project/docling-serve-cpu:v1.32.0

COPY --chmod=755 infra/docling/entrypoint.sh /app/entrypoint.sh
COPY infra/docling/port-forward.py /app/port-forward.py

# Railway sets PORT dynamically — Docling must listen on it
ENV PORT=5001
# UI off: Gradio fetches assets from raw.githubusercontent.com. Set it to
# "true" on the service to look at a conversion by hand; its analytics
# (api.gradio.app) stay off either way.
ENV DOCLING_SERVE_ENABLE_UI=false
ENV GRADIO_ANALYTICS_ENABLED=False
# The models are in the image; never ask the Hub (huggingface.co).
ENV HF_HUB_OFFLINE=1
ENV HF_HUB_DISABLE_TELEMETRY=1
# onnxruntime's own telemetry (mobile.events.data.microsoft.com).
ENV ORT_DISABLE_TELEMETRY=1
ENV DOCLING_SERVE_LOAD_MODELS_AT_BOOT=true
ENV DOCLING_SERVE_MAX_SYNC_WAIT=300
ENV DOCLING_NUM_THREADS=4

ENTRYPOINT []
CMD ["/app/entrypoint.sh"]
