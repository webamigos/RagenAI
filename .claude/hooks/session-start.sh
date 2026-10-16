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

# Skip the install only when the last *successful* one was for these exact
# manifests — a resumed session, or a container restored from the post-hook
# cache. The marker is written after `npm ci` exits 0, so an interrupted
# install leaves none and the next start retries; a changed lockfile or root
# package.json changes the hash. (An mtime comparison passed both cases.)
marker="node_modules/.session-start-manifests.sha256"
want_hash="$(cat package-lock.json package.json | sha256sum | cut -d' ' -f1)"

if [ -f "${marker}" ] && [ "$(cat "${marker}")" = "${want_hash}" ]; then
  echo "node_modules matches package-lock.json; skipping npm ci" >&2
  exit 0
fi

npm ci --no-audit --no-fund >&2
echo "${want_hash}" > "${marker}"
