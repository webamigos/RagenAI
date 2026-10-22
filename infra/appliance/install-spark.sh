#!/usr/bin/env bash
# Installs the on-premises appliance (Ragen + local Ollama models) on an
# NVIDIA DGX Spark — or any Linux host with an NVIDIA GPU and the NVIDIA
# Container Toolkit. Nothing is built: the apps come as published images,
# which carry linux/arm64 as well as linux/amd64.
#
#   bash infra/appliance/install-spark.sh                 # from a checkout
#   curl -fsSL https://raw.githubusercontent.com/webamigos/RagenAI/main/infra/appliance/install-spark.sh | bash
#
# Options (or the matching environment variables):
#   --host <name|ip>   address users open in the browser (RAGEN_HOST);
#                      default localhost, which works only on the Spark itself;
#                      a re-run without it keeps the address already set
#   --dir <path>       where to clone when not run from a checkout
#                      (RAGEN_DIR, default ~/ragen)
#   --ref <ref>        branch, tag or sha to clone (RAGEN_REF, default main)
#   --version <tag>    image tag to run (RAGEN_VERSION, default latest)
#   --cpu              skip the GPU check and the GPU overlay
#   --encrypt          encrypt thread messages with a generated local key
#                      (RAGEN_ENCRYPT=1). Off by default: a test install
#                      should not leave behind a key that must be kept
#
# Safe to re-run: secrets already in .env.local are kept, models already on
# the volume are not pulled again. What it does, and why each step exists:
# infra/appliance/README.md and the appliance spec in docs/specs/.

set -euo pipefail

RAGEN_HOST="${RAGEN_HOST:-}"
RAGEN_DIR="${RAGEN_DIR:-$HOME/ragen}"
RAGEN_REF="${RAGEN_REF:-main}"
RAGEN_VERSION="${RAGEN_VERSION:-latest}"
WEB_PORT="${WEB_PORT:-3000}"
USE_GPU=1
ENCRYPT="${RAGEN_ENCRYPT:-0}"
REPO_URL="https://github.com/webamigos/RagenAI.git"
# The small model the GPU check loads; it is in the appliance's default set.
SMOKE_MODEL="${SMOKE_MODEL:-qwen2.5:7b-instruct}"
ADMIN_PORT="${ADMIN_PORT:-3200}"
# Models (~20 GB) plus images; below the hard floor the first pull fails.
# A re-run whose models are already on the volume needs only room for image
# updates, so it gets the lower floor.
DISK_WARN_GB=60
DISK_MIN_GB=35
DISK_RERUN_MIN_GB=10

# The secrets create-ragen-app generates, per file. The encryption key is
# not one of them here: it is opt-in, see --encrypt.
# tests/architecture/install-spark-generates-every-appliance-secret.test.ts
# keeps these lists in step with the installer's manifest.
#
# Root .env.local, read by web, api and the worker:
SECRETS=(
  BETTER_AUTH_SECRET
  INTERNAL_API_SECRET
  SECRET_KEY
  SESSION_AUTH_SECRET
  WORKER_SECRET_KEY
  PUBLIC_LINK_TOKEN_SECRET
  MCP_SERVICE_SECRET
)
# apps/admin/.env.local, the only file the admin container reads. Its own
# value, not the root one:
ADMIN_SECRETS=(
  BETTER_AUTH_SECRET
)
# ...and the same value as the root file, because admin calls web with it
# (invitation resend, guardrail trials):
ADMIN_SHARED_SECRETS=(
  INTERNAL_API_SECRET
)

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mUWAGA:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31mBŁĄD:\033[0m %s\n' "$*" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --host) RAGEN_HOST="${2:?--host needs a value}"; shift 2 ;;
    --dir) RAGEN_DIR="${2:?--dir needs a value}"; shift 2 ;;
    --ref) RAGEN_REF="${2:?--ref needs a value}"; shift 2 ;;
    --version) RAGEN_VERSION="${2:?--version needs a value}"; shift 2 ;;
    --cpu) USE_GPU=0; shift ;;
    --encrypt) ENCRYPT=1; shift ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]:-/dev/null}" 2>/dev/null; exit 0 ;;
    *) die "nieznana opcja: $1 (--help pokazuje listę)" ;;
  esac
done

# --- 1. The host ------------------------------------------------------------

log "Sprawdzam hosta"

arch="$(uname -m)"
if [ "$arch" != "aarch64" ]; then
  warn "architektura $arch, nie aarch64 — to nie wygląda na DGX Spark. Kontynuuję: skrypt działa na każdym Linuksie z GPU NVIDIA."
fi

for cmd in docker git openssl curl; do
  command -v "$cmd" >/dev/null 2>&1 || die "brak polecenia: $cmd"
done

docker info >/dev/null 2>&1 ||
  die "docker nie odpowiada albo brak uprawnień. Dodaj użytkownika do grupy: sudo usermod -aG docker \$USER, potem zaloguj się ponownie."

# The `env_file: path:` form in docker-compose.fullapp.yml needs 2.24.
compose_version="$(docker compose version --short 2>/dev/null || true)"
[ -n "$compose_version" ] || die "brak Docker Compose v2 (docker compose)."
if [ "$(printf '%s\n2.24.0\n' "${compose_version#v}" | sort -V | head -n1)" != "2.24.0" ]; then
  die "Docker Compose $compose_version jest za stary; wymagany >= 2.24."
fi

if [ "$USE_GPU" = 1 ]; then
  if docker run --rm --gpus all ubuntu:24.04 nvidia-smi -L >/dev/null 2>&1; then
    log "GPU widoczne w kontenerach: $(docker run --rm --gpus all ubuntu:24.04 nvidia-smi -L | head -n1)"
  else
    die "kontener nie widzi GPU. Zainstaluj NVIDIA Container Toolkit (na DGX OS jest domyślnie) albo uruchom z --cpu."
  fi
fi

# --- 2. The checkout ----------------------------------------------------------

script_dir=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [ -n "$script_dir" ] && [ -f "$script_dir/../../docker-compose.appliance.yml" ]; then
  root="$(cd "$script_dir/../.." && pwd)"
  log "Używam repozytorium: $root"
elif [ -f "$RAGEN_DIR/docker-compose.appliance.yml" ]; then
  root="$RAGEN_DIR"
  log "Używam istniejącego klonu: $root"
else
  log "Klonuję $REPO_URL ($RAGEN_REF) do $RAGEN_DIR"
  git clone --depth 1 --branch "$RAGEN_REF" "$REPO_URL" "$RAGEN_DIR" 2>/dev/null ||
    { git clone "$REPO_URL" "$RAGEN_DIR" && git -C "$RAGEN_DIR" checkout "$RAGEN_REF"; }
  root="$RAGEN_DIR"
fi
cd "$root"

# --- 3. Environment -----------------------------------------------------------

if [ -f .env.local ]; then
  log ".env.local już istnieje — uzupełniam tylko puste sekrety"
else
  log "Tworzę .env.local z infra/appliance/appliance.env.example"
  cp infra/appliance/appliance.env.example .env.local
fi
chmod 600 .env.local

# Sets KEY=value in a dotenv file: replaces the line, or appends one.
set_env() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

# The last value of KEY in a dotenv file, or nothing.
get_env() {
  grep -E "^${2}=" "$1" 2>/dev/null | tail -n1 | cut -d= -f2- || true
}

generated=0
for key in "${SECRETS[@]}"; do
  if [ -z "$(get_env .env.local "$key")" ]; then
    set_env .env.local "$key" "$(openssl rand -hex 32)"
    generated=$((generated + 1))
  fi
done

admin_env=apps/admin/.env.local
touch "$admin_env"
chmod 600 "$admin_env"
for key in "${ADMIN_SECRETS[@]}"; do
  if [ -z "$(get_env "$admin_env" "$key")" ]; then
    set_env "$admin_env" "$key" "$(openssl rand -hex 32)"
    generated=$((generated + 1))
  fi
done
for key in "${ADMIN_SHARED_SECRETS[@]}"; do
  if [ -z "$(get_env "$admin_env" "$key")" ]; then
    set_env "$admin_env" "$key" "$(get_env .env.local "$key")"
  fi
done
log "Wygenerowane sekrety: $generated (istniejące zostawione bez zmian)"

# Thread-message encryption. A key already in .env.local is kept whatever
# the flag says: dropping it would leave every message written with it
# unreadable. Without one, the provider is cleared rather than left at the
# template's `local`, which with no key fails the apps' env check. The
# containers run with TARGET_ENV=local, where encryption is not required.
existing_key="$(get_env .env.local ENCRYPTION_MASTER_KEY)"
if [ -n "$existing_key" ]; then
  set_env .env.local ENCRYPTION_PROVIDER local
  log "Szyfrowanie: włączone (klucz już był w .env.local, zostawiam go)"
elif [ "$ENCRYPT" = 1 ]; then
  set_env .env.local ENCRYPTION_PROVIDER local
  set_env .env.local ENCRYPTION_MASTER_KEY "$(openssl rand -hex 32)"
  log "Szyfrowanie: włączone, wygenerowany ENCRYPTION_MASTER_KEY"
else
  set_env .env.local ENCRYPTION_PROVIDER ""
  log "Szyfrowanie: wyłączone, wiadomości w bazie jawnym tekstem (włączysz je flagą --encrypt)"
fi

# No --host on a re-run keeps the address the install already has, rather
# than quietly moving it back to localhost.
app_url="http://${RAGEN_HOST}:${WEB_PORT}"
if [ -z "$RAGEN_HOST" ]; then
  app_url="$(get_env .env APP_URL)"
  app_url="${app_url:-http://localhost:${WEB_PORT}}"
fi
set_env .env.local APP_URL "$app_url"
set_env .env.local NEXT_PUBLIC_APP_URL "$app_url"
# The admin panel's own address; compose sets no APP_URL for it, so this
# file is where it comes from.
admin_url="http://${RAGEN_HOST}:${ADMIN_PORT}"
if [ -z "$RAGEN_HOST" ]; then
  admin_url="$(get_env "$admin_env" APP_URL)"
  admin_url="${admin_url:-http://localhost:${ADMIN_PORT}}"
fi
set_env "$admin_env" APP_URL "$admin_url"
set_env "$admin_env" NEXT_PUBLIC_APP_URL "$admin_url"

compose_files="docker-compose.yml:docker-compose.fullapp.yml:docker-compose.appliance.yml"
if [ "$USE_GPU" = 1 ]; then
  compose_files="$compose_files:docker-compose.appliance.gpu.yml"
fi

# .env is the file Compose itself reads. COMPOSE_FILE makes a bare
# `docker compose ps|logs|down` here address the whole appliance; APP_URL
# reaches web's `environment:`, which a value in .env.local cannot.
touch .env
set_env .env COMPOSE_FILE "$compose_files"
set_env .env APP_URL "$app_url"
set_env .env RAGEN_VERSION "$RAGEN_VERSION"
set_env .env WEB_PORT "$WEB_PORT"
set_env .env ADMIN_PORT "$ADMIN_PORT"

# Disk, now that Compose can name the project: a models volume that already
# exists means the 20 GB pull is behind us.
docker_root="$(docker info -f '{{.DockerRootDir}}')"
free_gb=$(($(df -Pk "$docker_root" | awk 'NR==2 {print $4}') / 1024 / 1024))
project="$(docker compose config 2>/dev/null | sed -n 's/^name: //p' | head -n1)"
models_volume="$(docker volume ls -q \
  --filter "label=com.docker.compose.project=${project}" \
  --filter "label=com.docker.compose.volume=ollama_models" 2>/dev/null || true)"
min_gb="$DISK_MIN_GB"
if [ -n "$models_volume" ]; then
  min_gb="$DISK_RERUN_MIN_GB"
fi
if [ "$free_gb" -lt "$min_gb" ]; then
  die "tylko ${free_gb} GB wolnego w $docker_root; potrzeba co najmniej ${min_gb} GB."
elif [ -z "$models_volume" ] && [ "$free_gb" -lt "$DISK_WARN_GB" ]; then
  warn "${free_gb} GB wolnego w $docker_root — wystarczy na start, ale zalecane ${DISK_WARN_GB} GB."
fi

# --- 4. Images ----------------------------------------------------------------

log "Pobieram obrazy (RAGEN_VERSION=$RAGEN_VERSION)"
docker compose pull

# A missing arm64 image is not an error: Docker runs the amd64 one under
# emulation, slowly and without a word (docs/lessons/
# a-single-architecture-image-is-emulated-rather-than-refused.md).
host_arch="$(docker info -f '{{.Architecture}}')"
case "$host_arch" in aarch64) host_arch=arm64 ;; x86_64) host_arch=amd64 ;; esac
for image in $(docker compose config --images | sort -u); do
  image_arch="$(docker image inspect -f '{{.Architecture}}' "$image" 2>/dev/null || true)"
  if [ -n "$image_arch" ] && [ "$image_arch" != "$host_arch" ]; then
    warn "$image jest dla $image_arch, host to $host_arch — będzie działał w emulacji (wolno)."
  fi
done

# --- 5. Models ----------------------------------------------------------------

log "Uruchamiam Ollamę i pobieram modele (~20 GB za pierwszym razem)"
docker compose up -d ollama ollama-models
docker compose logs -f --no-log-prefix ollama-models || true
models_exit="$(docker inspect -f '{{.State.ExitCode}}' "$(docker compose ps -aq ollama-models)")"
[ "$models_exit" = 0 ] || die "pobieranie modeli nie powiodło się (kod $models_exit). Zobacz: docker compose logs ollama-models"

if [ "$USE_GPU" = 1 ]; then
  log "Sprawdzam, czy Ollama liczy na GPU ($SMOKE_MODEL)"
  docker compose exec -T ollama ollama run "$SMOKE_MODEL" "Odpowiedz jednym słowem: ok" >/dev/null
  processor="$(docker compose exec -T ollama ollama ps | awk -v m="$SMOKE_MODEL" '$1 == m' || true)"
  if printf '%s' "$processor" | grep -q "100% GPU"; then
    log "Ollama: model w całości na GPU"
  else
    warn "Ollama nie liczy w całości na GPU: '${processor:-brak danych}'. Sprawdź 'docker compose logs ollama' (czy wykrył CUDA); może być potrzebna nowsza wersja obrazu ollama/ollama w docker-compose.appliance.yml."
  fi
fi

# --- 6. Ragen -----------------------------------------------------------------

log "Uruchamiam Ragena (migracje bazy, web, api, worker)"
docker compose up -d

log "Czekam, aż web odpowie na http://localhost:${WEB_PORT}"
for _ in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${WEB_PORT}/" || true)"
  if [ -n "$code" ] && [ "$code" != 000 ] && [ "$code" -lt 500 ]; then
    break
  fi
  sleep 5
done
if [ -z "${code:-}" ] || [ "$code" = 000 ] || [ "$code" -ge 500 ]; then
  docker compose ps -a
  die "web nie odpowiada po 7,5 minuty. Zobacz: docker compose logs migrate web api"
fi

cat <<EOF

$(printf '\033[1;32m')Ragen działa.$(printf '\033[0m')

  Otwórz:        ${app_url}
                 Pierwsze założone konto zostaje administratorem platformy.
  Panel admina:  ${admin_url}
  Katalog:       ${root}, a w nim:
                   docker compose ps
                   docker compose logs -f
                   docker compose down

Zanim oddasz instalację klientowi:
EOF

if grep -qE '^ENCRYPTION_MASTER_KEY=.' .env.local; then
  cat <<EOF
  - Zrób kopię ENCRYPTION_MASTER_KEY z ${root}/.env.local razem z backupem
    bazy. Bez tego klucza wiadomości w wątkach są nie do odczytania.
EOF
else
  cat <<EOF
  - Szyfrowanie wiadomości jest wyłączone. Na produkcję uruchom skrypt
    ponownie z --encrypt.
EOF
fi

cat <<EOF
  - Porty ${WEB_PORT} (web), 3001 (API) i ${ADMIN_PORT} (panel admina) są otwarte
    w sieci. Postaw przed web reverse proxy z TLS, a 3001/${ADMIN_PORT} zamknij
    firewallem, jeśli nie mają być dostępne z zewnątrz.
  - Reranking jest wyłączony (brak lokalnego rerankera w tym profilu).
  - Dowód, że nic nie wychodzi z maszyny (wymaga Node.js):
      npm run appliance:egress-check -- --full-models
EOF
