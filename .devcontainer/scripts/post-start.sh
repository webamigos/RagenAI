#!/usr/bin/env bash
#
# Runs on every container start, including after a stop/resume. Deliberately
# cheap: a full `npm ci` here would add minutes to resuming a Codespace, so it
# only runs when the lockfile has moved since the last install — which is what
# happens after pulling someone else's dependency change.
set -euo pipefail

cd /workspace

if [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "==> package-lock.json changed since the last install — running npm ci"
  npm ci
fi

npx prisma migrate deploy || {
  echo "WARNING: prisma migrate deploy failed."
  echo "         Usually a branch switch across migrations: check 'npx prisma migrate status'."
}
