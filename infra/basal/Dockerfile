# basal-serve, the typed-decision server behind the guardrail first pass
# (docs/specs/2026-10-13-typed-decisions-on-basal.md, step B1).
#
# NVIDIA only. basal's fast engine needs CUDA, and Docker on macOS has no GPU:
# on a Mac, run `basal-serve --mode mlx` natively instead (see
# docs/companion-services.md). torch's CUDA wheels carry their own CUDA
# runtime, so a slim Python base is enough; the driver comes from the host
# through the NVIDIA container toolkit.
#
# The engine version is pinned here and the weights by commit at start, in the
# entrypoint. A fitted first-pass threshold is valid for one model on one
# engine, so neither may float: a new version here, or a new revision there,
# is an upgrade, and the spec's rollout says turn `guardrailFirstPass` off
# before it.
FROM python:3.12-slim-bookworm

ARG BASAL_VERSION=v2.0.0
ARG TORCH_VERSION=2.11.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# torch first, from the CUDA 12.8 index, as upstream's README says: a plain
# install of basal may pull a torch built for a newer CUDA than the driver.
RUN pip install --no-cache-dir "torch==${TORCH_VERSION}" \
        --index-url https://download.pytorch.org/whl/cu128 \
    && pip install --no-cache-dir \
        "basal[fp8] @ https://github.com/rkinas/basal/archive/refs/tags/${BASAL_VERSION}.tar.gz"

COPY entrypoint.sh /usr/local/bin/basal-entrypoint
RUN chmod +x /usr/local/bin/basal-entrypoint

# Weights live in a volume, so a restart does not download them again.
ENV HF_HOME=/models/hf
VOLUME ["/models"]

EXPOSE 8000
ENTRYPOINT ["basal-entrypoint"]
