#!/bin/bash
# SessionStart hook for Claude Code cloud sessions (claude.ai/code).
#
# A cloud container starts from a fresh clone with no node_modules and the
# image's Node, which is 22 — `engine-strict` refuses that, so not even
# `npm ci` runs until the right Node is there. This installs the `.nvmrc`
# version, puts it first on PATH for the session, and installs dependencies;
# the root `postinstall` then builds the packages and generates every Prisma
# client, which is what `npm run verify` needs. No-op on a laptop.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

want="$(tr -d '[:space:]v' < .nvmrc)"
node_dir="/opt/node-v${want}"

if [ "$(node -v 2>/dev/null || true)" != "v${want}" ]; then
  if [ ! -x "${node_dir}/bin/node" ]; then
    echo "Installing Node ${want} into ${node_dir}" >&2
    tmp="$(mktemp -d)"
    curl -fsSL "https://nodejs.org/dist/v${want}/node-v${want}-linux-x64.tar.xz" \
      -o "${tmp}/node.tar.xz"
    mkdir -p "${node_dir}"
    tar -xJf "${tmp}/node.tar.xz" -C "${node_dir}" --strip-components=1
    rm -rf "${tmp}"
  fi
  export PATH="${node_dir}/bin:${PATH}"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"${node_dir}/bin:\$PATH\"" >> "${CLAUDE_ENV_FILE}"
  fi
fi

# Skip the install when node_modules already matches the lockfile — a resumed
# session, or a container restored from the post-hook cache.
if [ -f node_modules/.package-lock.json ] &&
  [ node_modules/.package-lock.json -nt package-lock.json ]; then
  echo "node_modules is current; skipping npm ci" >&2
  exit 0
fi

npm ci --no-audit --no-fund >&2
