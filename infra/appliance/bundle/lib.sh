#!/usr/bin/env bash
# Shared by build-bundle.sh (a connected machine) and install-offline.sh (the
# machine with no network): the bundle's layout, its checksum manifest and the
# bookkeeping that makes a rollback possible. Step C2 of
# docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md.
#
# Sourced, never run. Everything here works without a Docker daemon, which is
# what lets tests/scripts/appliance-offline-bundle.test.ts exercise it.
#
# A bundle is a directory:
#
#   install-offline.sh  lib.sh     the installer, as the release shipped it
#   manifest.env                   version, platform, commit, what is inside
#   images.tsv                     image reference, image id, platform
#   models.txt                     the Ollama models in ollama-models.tar
#   checkout.sha256                every file of the checkout, for finding
#                                  local edits on the next upgrade
#   images.tar                     `docker save` of every image
#   checkout.tar.gz                the repository at the release's commit
#   ollama-models.tar              the models volume (absent with --no-models)
#   basal-models.tar               basal's weights (only with --with-basal)
#   SHA256SUMS                     sha256 of every file above

# The manifest's shape. A bundle written for another format is refused.
# shellcheck disable=SC2034
BUNDLE_FORMAT=1
BUNDLE_SUMS=SHA256SUMS

# The appliance stack whose images a bundle carries. The GPU overlay adds a
# device reservation and no image, so it is the installer's choice, not the
# bundle's. docker-compose.pii.yml is not here: its analyzer is built from
# source and has no published image.
# shellcheck disable=SC2034
BUNDLE_COMPOSE_FILES="docker-compose.yml:docker-compose.fullapp.yml:docker-compose.appliance.yml"

# Files every bundle has. ollama-models.tar and basal-models.tar are required
# only when the manifest says they are inside.
BUNDLE_REQUIRED_FILES=(
  install-offline.sh
  lib.sh
  manifest.env
  images.tsv
  models.txt
  checkout.sha256
  images.tar
  checkout.tar.gz
)

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mUWAGA:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31mBŁĄD:\033[0m %s\n' "$*" >&2
  exit 1
}

# The last value of KEY in a dotenv file, or nothing. Read, never sourced: a
# manifest comes from outside the machine.
get_env() {
  grep -E "^${2}=" "$1" 2>/dev/null | tail -n1 | cut -d= -f2- || true
}

# Sets KEY=value in a dotenv file: replaces the line, or appends one.
set_env() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

# Docker's and uname's names for an architecture, as the one an image carries.
normalize_arch() {
  case "$1" in
    aarch64 | arm64) printf 'arm64' ;;
    x86_64 | amd64) printf 'amd64' ;;
    *) printf '%s' "$1" ;;
  esac
}

# linux/arm64 -> arm64
platform_arch() {
  local rest="${1#*/}"
  printf '%s' "${rest%%/*}"
}

# A release version, an image reference and a model id each reach a docker
# command line and a sed expression, so each has to look like one.
valid_version() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]
}
valid_image_ref() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._/:@-]*$ ]]
}
valid_model() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._/:-]*$ ]]
}
valid_platform() {
  [[ "$1" =~ ^linux/(amd64|arm64)$ ]]
}

# `docker compose config --images` names an image once per service that uses
# it (ollama and ollama-models share one). stdin -> one line per image.
unique_images() {
  sed -e 's/[[:space:]]*$//' -e '/^$/d' | LC_ALL=C sort -u
}

# One environment value out of `docker compose config --format json`, which
# prints each key on a line of its own. The YAML form cannot be read this
# way: it folds a long value across lines. stdin -> the first match.
compose_json_value() {
  sed -n "s/^[[:space:]]*\"$1\": \"\\(.*\\)\",\\{0,1\\}[[:space:]]*\$/\\1/p" | head -n1
}

# The project name out of the same JSON (the top-level "name").
compose_json_project() {
  sed -n 's/^  "name": "\(.*\)",\{0,1\}[[:space:]]*$/\1/p' | head -n1
}

# The models the `ollama-models` job pulls: its own APPLIANCE_MODELS, as
# Compose resolved it. stdin: the config JSON -> one model per line.
compose_json_models() {
  compose_json_value APPLIANCE_MODELS | tr -s '[:space:]' '\n' | sed '/^$/d'
}

# Where an image is kept while a newer release holds its tag, so that going
# back is a re-tag. `postgres:16` moves when a new bundle is loaded and the
# old image is left with no name at all; this is the name that keeps it.
#
#   rollback_ref ghcr.io/webamigos/ragen-web:1.4.0 1.4.0
#     -> ragen-rollback/ghcr.io/webamigos/ragen-web:1.4.0--1.4.0
rollback_ref() {
  local image="$1" version="$2" repo tag last
  case "$image" in
    *@*) return 1 ;; # a digest reference cannot move, so it needs no keeping
  esac
  last="${image##*/}"
  if [ "$last" != "${last%:*}" ]; then
    tag="${image##*:}"
    repo="${image%:*}"
  else
    tag=latest
    repo="$image"
  fi
  repo="$(printf '%s' "$repo" | tr '[:upper:]' '[:lower:]' | tr ':' '-')"
  version="$(printf '%s' "$version" | tr -c 'A-Za-z0-9_.-' '-')"
  printf 'ragen-rollback/%s:%s--%s' "$repo" "$tag" "$version"
}

# Every file under a directory, relative, sorted, the sums file left out.
bundle_files() {
  (cd "$1" && find . -type f ! -name "$BUNDLE_SUMS" | sed 's|^\./||' | LC_ALL=C sort)
}

# Writes SHA256SUMS for a bundle directory and prints the sum of that file,
# which is the one value worth sending by another road than the bundle.
write_sums() {
  local dir="$1" file
  : >"$dir/$BUNDLE_SUMS.tmp"
  while IFS= read -r file; do
    (cd "$dir" && sha256sum "$file") >>"$dir/$BUNDLE_SUMS.tmp"
  done < <(bundle_files "$dir" | grep -v "^$BUNDLE_SUMS.tmp\$")
  mv "$dir/$BUNDLE_SUMS.tmp" "$dir/$BUNDLE_SUMS"
  sums_digest "$dir"
}

sums_digest() {
  sha256sum <"$1/$BUNDLE_SUMS" | cut -d' ' -f1
}

# The paths SHA256SUMS lists.
sums_listed() {
  sed -E 's/^[0-9a-f]{64} [ *]//' "$1/$BUNDLE_SUMS"
}

# Verifies a bundle directory without touching anything else: the manifest's
# format, that every file the installer will read is listed, and every
# checksum. Prints what is wrong and returns 1; prints nothing and returns 0.
#
#   verify_bundle <dir> [<expected sha256 of SHA256SUMS>]
verify_bundle() {
  local dir="$1" expected="${2:-}" file format listed required

  if [ ! -f "$dir/$BUNDLE_SUMS" ]; then
    echo "brak pliku $BUNDLE_SUMS w $dir"
    return 1
  fi
  if [ -n "$expected" ] && [ "$(sums_digest "$dir")" != "$expected" ]; then
    echo "suma pliku $BUNDLE_SUMS to $(sums_digest "$dir"), oczekiwano $expected"
    return 1
  fi
  if grep -qvE '^[0-9a-f]{64} [ *][A-Za-z0-9._-]+$' "$dir/$BUNDLE_SUMS"; then
    echo "$BUNDLE_SUMS zawiera wpis, który nie jest sumą pliku z katalogu paczki"
    return 1
  fi

  listed="$(sums_listed "$dir")"
  required=("${BUNDLE_REQUIRED_FILES[@]}")
  # Also when the file is simply there. The installer unpacks either archive
  # if it finds it, so one added to a bundle built without it must be under
  # the checksums like the rest, or it is read unverified.
  if [ -s "$dir/models.txt" ] || [ -f "$dir/ollama-models.tar" ]; then
    required+=(ollama-models.tar)
  fi
  if [ -n "$(get_env "$dir/manifest.env" BASAL_IMAGE)" ] || [ -f "$dir/basal-models.tar" ]; then
    required+=(basal-models.tar)
  fi
  for file in "${required[@]}"; do
    if ! printf '%s\n' "$listed" | grep -qxF "$file"; then
      echo "$BUNDLE_SUMS nie wymienia pliku $file"
      return 1
    fi
  done

  if ! (cd "$dir" && sha256sum --check --strict --quiet "$BUNDLE_SUMS" 2>&1); then
    echo "sumy kontrolne się nie zgadzają"
    return 1
  fi

  format="$(get_env "$dir/manifest.env" BUNDLE_FORMAT)"
  if [ "$format" != "$BUNDLE_FORMAT" ]; then
    echo "format paczki '$format', ten instalator czyta format $BUNDLE_FORMAT"
    return 1
  fi
  return 0
}

# Files in the bundle directory that SHA256SUMS does not list. The installer
# reads none of them — the two archives it would read are refused unlisted
# by verify_bundle — so this is a warning, not a refusal.
unlisted_files() {
  local listed
  listed="$(sums_listed "$1")"
  bundle_files "$1" | grep -vxF -f <(printf '%s\n' "$listed") || true
}

# Checks the manifest's own values before any of them reaches a command.
validate_manifest() {
  local dir="$1" ref id platform model
  valid_version "$(get_env "$dir/manifest.env" RAGEN_VERSION)" || {
    echo "manifest.env: nieprawidłowe RAGEN_VERSION"
    return 1
  }
  valid_platform "$(get_env "$dir/manifest.env" PLATFORM)" || {
    echo "manifest.env: nieprawidłowe PLATFORM"
    return 1
  }
  if [ ! -s "$dir/images.tsv" ]; then
    echo "images.tsv jest pusty"
    return 1
  fi
  while IFS=$'\t' read -r ref id platform; do
    if ! valid_image_ref "$ref" || [ -z "$id" ] || ! valid_platform "$platform"; then
      echo "images.tsv: nieprawidłowy wiersz '$ref'"
      return 1
    fi
  done <"$dir/images.tsv"
  while IFS= read -r model; do
    valid_model "$model" || {
      echo "models.txt: nieprawidłowy model '$model'"
      return 1
    }
  done <"$dir/models.txt"
  return 0
}

# The files of an installed checkout that differ from what its bundle put
# there. `sha256sum --check` names each as "<path>: FAILED"; a file the
# operator deleted is not an edit worth keeping.
#
#   changed_files <install dir> <checkout.sha256 of the installed release>
changed_files() {
  (cd "$1" && sha256sum --check --quiet --ignore-missing "$2" 2>/dev/null || true) |
    sed -n 's/: FAILED$//p'
}

# Compose's own name for a volume, and the labels that make Compose treat a
# volume created ahead of it as its own instead of warning about it.
volume_name() {
  printf '%s_%s' "$1" "$2"
}
