#!/usr/bin/env bash
#
# Runs on the *host* (your laptop, or the Codespaces VM) before the container
# is created — devcontainer.json's initializeCommand. Two jobs, both of which
# have to happen before Compose reads the stack:
#
#   1. regenerate the named-volume override;
#   2. make sure a root .env.local exists, because docker-compose.yml's
#      `litellm` service declares `env_file: .env.local` and Compose fails
#      outright when that file is absent — before any container, and so
#      before post-create.sh could have created it.
#
# Deliberately dependency-free: the host may have no node_modules installed
# and, in Codespaces, nothing but a shell and Docker.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

bash .devcontainer/scripts/generate-compose-volumes.sh

# A plain copy, with no rewriting of any kind. Everything that has to differ
# inside the container (database host, Qdrant, LiteLLM, Temporal, Redis) is a
# real environment variable set in docker-compose.devcontainer.yml, and real
# environment variables already beat env files. Secrets are filled in later by
# post-create.sh, which can reuse create-ragen-app's manifest once
# node_modules exists.
ensure_env_local() {
  local dir="$1"
  if [ -f "$dir/.env.local" ]; then
    return
  fi
  if [ ! -f "$dir/.env.example" ]; then
    echo "ERROR: $dir/.env.example is missing — cannot create $dir/.env.local" >&2
    exit 1
  fi
  cp "$dir/.env.example" "$dir/.env.local"
  chmod 600 "$dir/.env.local"
  echo "Created $dir/.env.local from .env.example (secrets are generated after the container starts)."
}

ensure_env_local "."
ensure_env_local "apps/admin"
