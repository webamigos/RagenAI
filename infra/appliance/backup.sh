#!/usr/bin/env bash
# Takes one backup set of the appliance: Postgres, every Qdrant collection,
# the documents on the local volume, and the configuration — in one window,
# with the writers stopped. It is section 3 of docs/appliance-runbook.md as a
# script, so a timer can run it.
#
#   bash infra/appliance/backup.sh                    # from the checkout
#   bash infra/appliance/backup.sh --dir /mnt/nas/ragen --keep 14
#
# Options (or the matching environment variables):
#   --dir <path>           where the sets go (RAGEN_BACKUP_DIR,
#                          default /var/backups/ragen)
#   --keep <n>             complete sets to keep, oldest deleted first
#                          (RAGEN_BACKUP_KEEP, default 7; 0 keeps every set)
#   --storage-elsewhere    documents live in S3 (STORAGE_PROVIDER=s3) and are
#                          backed up there; take the set without them
#
# A set is a directory named <YYYYMMDD-HHMM>. It is written as
# <name>.partial and renamed once every step succeeded, so a directory with
# the plain name is always a complete set. Restore: runbook section 4.
#
# The set holds ENCRYPTION_MASTER_KEY (.env.local) next to the encrypted
# messages. Keep the target as protected as the machine.

set -euo pipefail

BACKUP_DIR="${RAGEN_BACKUP_DIR:-/var/backups/ragen}"
KEEP="${RAGEN_BACKUP_KEEP:-7}"
STORAGE_ELSEWHERE=0
# The services that write to the three stores. Postgres, Qdrant and Ollama
# keep running: the dump and the snapshots are taken from them.
WRITERS=(web api worker admin)

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mUWAGA:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31mBŁĄD:\033[0m %s\n' "$*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) BACKUP_DIR="${2:?--dir needs a value}"; shift 2 ;;
    --keep) KEEP="${2:?--keep needs a value}"; shift 2 ;;
    --storage-elsewhere) STORAGE_ELSEWHERE=1; shift ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "nieznana opcja: $1 (--help pokazuje listę)" ;;
  esac
done

case "$KEEP" in
  '' | *[!0-9]*) die "--keep musi być liczbą całkowitą ≥ 0, nie: $KEEP" ;;
esac

# The checkout: compose reads its files and `.env` from the working directory.
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
[ -f docker-compose.yml ] || die "nie widzę docker-compose.yml w $(pwd) — uruchom skrypt z checkoutu"
[ -f .env.local ] || die "brak .env.local w $(pwd) — to nie jest zainstalowany appliance"

for cmd in docker curl sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || die "brak polecenia: $cmd"
done

# Last assignment wins, as Compose reads it. Never `source`: an env file is
# not a shell script, and a value with a space or a `$` would run.
get_env() {
  grep -E "^${2}=" "$1" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true
}

PG_USER="$(get_env .env POSTGRES_USER)"
PG_USER="${PG_USER:-postgres}"
PG_DB="$(get_env .env POSTGRES_DB)"
PG_DB="${PG_DB:-ragen}"
QDRANT_PORT="$(get_env .env QDRANT_PORT)"
QDRANT="http://127.0.0.1:${QDRANT_PORT:-6333}"
QDRANT_API_KEY="$(get_env .env.local QDRANT_API_KEY)"
# What the containers actually get: docker-compose.fullapp.yml sets
# `STORAGE_PROVIDER: ${STORAGE_PROVIDER:-local}` in `environment:`, which
# Compose fills from the shell and then `.env`, and which wins over
# `.env.local`. Reading `.env.local` here would archive an empty volume on an
# install whose documents are in S3, and call the set complete.
STORAGE_PROVIDER="${STORAGE_PROVIDER:-$(get_env .env STORAGE_PROVIDER)}"
STORAGE_PROVIDER="${STORAGE_PROVIDER:-local}"

if [ "$STORAGE_PROVIDER" != "local" ] && [ "$STORAGE_ELSEWHERE" -ne 1 ]; then
  die "STORAGE_PROVIDER=$STORAGE_PROVIDER: dokumenty nie leżą na lokalnym wolumenie, więc ten skrypt ich nie zabierze. Zrób ich kopię po stronie S3 (runbook, sekcja 3) i uruchom z --storage-elsewhere."
fi

qdrant() {
  if [ -n "$QDRANT_API_KEY" ]; then
    curl -fsS -H "api-key: $QDRANT_API_KEY" "$@"
  else
    curl -fsS "$@"
  fi
}

# `"name":"…"` values of a Qdrant response, one per line. Collection and
# snapshot names are ids and timestamps, never a quote or a backslash, so
# this needs no JSON parser — and the machine may not have jq.
names() { grep -o '"name":"[^"]*"' | cut -d'"' -f4 || true; }

mkdir -p "$BACKUP_DIR"
# Everything below is readable by the owner only: the set carries secrets.
umask 077

# One run at a time, per install and not per target: a manual run into
# another --dir that starts while the nightly one has the writers stopped
# would find nothing to stop, and the nightly one would start them again in
# the middle of its dump. The lock is the checkout directory itself, so it
# needs no file and survives no crash.
if command -v flock >/dev/null 2>&1; then
  exec 9<"$PWD"
  flock -n 9 || die "inny backup tej instalacji już trwa ($PWD)"
fi

SET="$(date +%Y%m%d-%H%M)"
B="$BACKUP_DIR/$SET"
[ ! -e "$B" ] || die "zestaw $B już istnieje — odczekaj minutę albo usuń go"
PARTIAL="$B.partial"
rm -rf "$PARTIAL"
mkdir -p "$PARTIAL/qdrant"

# Only what was running is stopped, and exactly that is started again — on
# success and on every failure. A machine left with its apps down is worse
# than a missing backup.
stopped=()
# The snapshot Qdrant is holding for us right now, as "collection/name".
pending_snapshot=""
restart_writers() {
  status=$?
  trap - EXIT
  if [ -n "$pending_snapshot" ]; then
    # A download that failed leaves the snapshot on the server, where it
    # grows the container on every failed night.
    qdrant -X DELETE "$QDRANT/collections/${pending_snapshot%%/*}/snapshots/${pending_snapshot#*/}" >/dev/null 2>&1 ||
      warn "migawka ${pending_snapshot#*/} została w Qdrancie (kolekcja ${pending_snapshot%%/*})"
  fi
  if [ "${#stopped[@]}" -gt 0 ]; then
    log "Uruchamiam z powrotem: ${stopped[*]}"
    started=0
    for attempt in 1 2 3; do
      if docker compose start "${stopped[@]}" >/dev/null; then
        started=1
        break
      fi
      [ "$attempt" -eq 3 ] || sleep "${RAGEN_BACKUP_RETRY_SECONDS:-5}"
    done
    if [ "$started" -ne 1 ]; then
      # Louder than a failed backup: the apps are down. Never exit 0 here,
      # or the timer reports a good night with the install stopped.
      warn "NIE udało się uruchomić: ${stopped[*]} — aplikacje stoją. Uruchom ręcznie: docker compose start ${stopped[*]}"
      [ "$status" -ne 0 ] || status=1
    fi
  fi
  if [ ! -d "$B" ]; then
    warn "backup NIE powstał; niepełny zestaw został w $PARTIAL"
  fi
  exit "$status"
}
trap restart_writers EXIT

running="$(docker compose ps --services --status running)" ||
  die "docker compose nie odpowiada — czy stos działa i czy COMPOSE_FILE jest w .env?"
for service in "${WRITERS[@]}"; do
  if printf '%s\n' "$running" | grep -qx "$service"; then
    stopped+=("$service")
  fi
done
printf '%s\n' "$running" | grep -qx postgres || die "postgres nie działa — nie ma z czego zrobić zrzutu"
printf '%s\n' "$running" | grep -qx qdrant || die "qdrant nie działa — nie ma z czego zrobić migawek"

if [ "${#stopped[@]}" -gt 0 ]; then
  log "Zatrzymuję zapisujących: ${stopped[*]}"
  docker compose stop "${stopped[@]}" >/dev/null
fi

log "Postgres ($PG_DB)"
docker compose exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" -Fc >"$PARTIAL/postgres.dump"
[ -s "$PARTIAL/postgres.dump" ] || die "pg_dump zwrócił pusty plik"

log "Qdrant"
collections="$(qdrant "$QDRANT/collections" | names)"
count=0
for collection in $collections; do
  snapshot="$(qdrant -X POST "$QDRANT/collections/$collection/snapshots" | names | head -n1)"
  [ -n "$snapshot" ] || die "Qdrant nie zwrócił nazwy migawki dla kolekcji $collection"
  pending_snapshot="$collection/$snapshot"
  qdrant "$QDRANT/collections/$collection/snapshots/$snapshot" -o "$PARTIAL/qdrant/$collection.snapshot"
  # Qdrant keeps the snapshot inside its container, not on the volume, so a
  # snapshot left behind grows the container until it is recreated.
  qdrant -X DELETE "$QDRANT/collections/$collection/snapshots/$snapshot" >/dev/null ||
    warn "nie udało się usunąć migawki $snapshot z Qdranta (kolekcja $collection)"
  pending_snapshot=""
  count=$((count + 1))
done
log "Qdrant: $count kolekcji"

if [ "$STORAGE_PROVIDER" = "local" ]; then
  log "Dokumenty (wolumen storage_data)"
  # The worker image is always on the machine and has tar; --no-deps keeps
  # it from starting anything else.
  docker compose run --rm --no-deps -T --user root --entrypoint tar worker \
    -C /data/storage -cf - . >"$PARTIAL/storage.tar"
else
  warn "dokumenty są w $STORAGE_PROVIDER i nie wchodzą do tego zestawu (--storage-elsewhere)"
fi

log "Konfiguracja"
cp .env.local "$PARTIAL/.env.local"
[ ! -f .env ] || cp .env "$PARTIAL/.env"
[ ! -f apps/admin/.env.local ] || cp apps/admin/.env.local "$PARTIAL/admin.env.local"
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  git diff >"$PARTIAL/local-changes.diff"
  commit="$(git rev-parse HEAD)"
else
  commit="unknown"
fi

{
  printf 'set=%s\n' "$SET"
  printf 'ragen_version=%s\n' "$(get_env .env RAGEN_VERSION)"
  printf 'commit=%s\n' "$commit"
  printf 'postgres_db=%s\n' "$PG_DB"
  printf 'qdrant_collections=%s\n' "$count"
  printf 'storage=%s\n' "$([ "$STORAGE_PROVIDER" = "local" ] && echo included || echo "not included ($STORAGE_PROVIDER)")"
} >"$PARTIAL/MANIFEST"

# Checked on restore: a set copied to a NAS and back is not assumed intact.
(cd "$PARTIAL" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS)

mv "$PARTIAL" "$B"
log "Zestaw gotowy: $B"

# Retention counts complete sets only, and deletes only directories whose
# name is a set's name — never a .partial, never anything else in the target.
if [ "$KEEP" -gt 0 ]; then
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]' |
    sort -r | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
    log "Usuwam stary zestaw: $old"
    rm -rf "$old"
  done
fi
