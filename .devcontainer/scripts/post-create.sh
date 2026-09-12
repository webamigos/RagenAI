#!/usr/bin/env bash
#
# Runs once, inside the container, right after it is created.
set -euo pipefail

cd /workspace

echo "==> [1/4] Taking ownership of the named volumes"
# Docker creates a named volume owned by root, and everything below runs as
# `node`. The paths come from the generated override rather than a list
# repeated here, so they cannot fall out of step with it.
mount_targets="$(grep -oE ':/workspace/[^ ]+' .devcontainer/docker-compose.volumes.yml | cut -d: -f2)"
for target in $mount_targets; do
  if [ -d "$target" ]; then
    sudo chown "$(id -u):$(id -g)" "$target"
  fi
done

echo "==> [2/4] Installing dependencies"
# `npm ci` rather than `npm install`: it installs exactly the lockfile, which
# is the difference between this container matching CI and merely resembling
# it. postinstall builds the workspace packages and generates the Prisma
# client, so neither needs its own step here.
npm ci

echo "==> [3/4] Filling in .env.local secrets"
node .devcontainer/scripts/setup-env.mjs

echo "==> [4/4] Applying database migrations"
for attempt in 1 2 3; do
  if npx prisma migrate deploy; then
    break
  fi
  if [ "$attempt" = "3" ]; then
    # Exit rather than fall through: the container is still usable and you get
    # a shell either way, but printing "Ready" over a database that has no
    # schema is how someone spends an hour debugging the wrong layer.
    echo "ERROR: prisma migrate deploy failed three times."
    echo "       The container is usable. Check 'docker logs ragen-postgres',"
    echo "       then rerun: npx prisma migrate deploy"
    exit 1
  fi
  echo "    retrying in 5s ..."
  sleep 5
done

cat <<'EOF'

============================================================
  Ready.

    npm run web:dev     web    → port 3000
    npm run admin:dev   admin  → port 3200
    npm run api:dev     api    → port 3001
    npm run verify      the gate CI runs

  Before the first question: paste an LLM provider key into
  .env.local, then restart the proxy so it picks it up:

    docker restart ragen-litellm

  Optional: npm run db:seed  (subscription plans + test user)
============================================================
EOF
