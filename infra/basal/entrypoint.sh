#!/bin/sh
# Download one pinned revision of the weights, then serve them.
#
# BASAL_MODEL_REVISION must be a full commit hash. A Hugging Face commit
# names its files by content (each LFS file is checked against the sha256 in
# that commit when it is downloaded), so the hash is the digest: the same
# hash cannot serve other weights. A branch name such as `main` can, which is
# why it is refused here rather than accepted with a warning.
set -eu

: "${BASAL_MODEL:?set BASAL_MODEL, e.g. Remek/basal-2.0-4.5B}"
: "${BASAL_MODEL_REVISION:?set BASAL_MODEL_REVISION to the 40-character commit the first-pass threshold was fitted on}"

case "$BASAL_MODEL_REVISION" in
  *[!0-9a-f]*)
    echo "BASAL_MODEL_REVISION must be a commit hash, not '$BASAL_MODEL_REVISION'" >&2
    exit 1
    ;;
esac
if [ "${#BASAL_MODEL_REVISION}" -ne 40 ]; then
  echo "BASAL_MODEL_REVISION must be the full 40-character commit hash" >&2
  exit 1
fi

# basal-serve reports the folder's name as the served model (finding 4 of the
# spec), so the revision is part of that name. A different revision is then a
# different served model, and the first pass stops clearing on the first
# answer instead of trusting a threshold fitted on other weights.
MODEL_DIR="/models/${BASAL_MODEL##*/}@${BASAL_MODEL_REVISION}"

python - "$BASAL_MODEL" "$BASAL_MODEL_REVISION" "$MODEL_DIR" <<'PY'
import sys
from huggingface_hub import snapshot_download

repo_id, revision, local_dir = sys.argv[1:4]
snapshot_download(repo_id=repo_id, revision=revision, local_dir=local_dir)
PY

# `--template-prefix off` is what upstream prescribes for the 4.5B model
# (bf16 and FP8); mini and max run with the default. Set it, or any other
# flag, through BASAL_SERVE_ARGS.
# shellcheck disable=SC2086
exec basal-serve \
  --model "$MODEL_DIR" \
  --mode "${BASAL_SERVE_MODE:-fast}" \
  --host 0.0.0.0 \
  --port 8000 \
  ${BASAL_SERVE_ARGS:-}
