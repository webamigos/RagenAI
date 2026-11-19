#!/usr/bin/env bash
# Builds the offline bundle of one Ragen release, on a machine WITH a network:
# every image of the appliance stack, the default tier's model weights, the
# checkout at the release's commit and a checksum manifest. The bundle is then
# carried to the machine that has no network and installed there with the
# install-offline.sh inside it. Step C2 of
# docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md.
#
#   bash infra/appliance/bundle/build-bundle.sh --version 1.4.0 --platform linux/arm64
#
# Options:
#   --version <X.Y.Z>     the release to bundle; the image tag. Required, and
#                         never `latest`: a bundle is one release
#   --platform <os/arch>  linux/arm64 (DGX Spark) or linux/amd64; default is
#                         this machine's
#   --ref <ref>           the commit the checkout is taken from (default
#                         v<version>). Keep it on the same release as the
#                         images
#   --out <dir>           where to write (default ./ragen-bundle-<version>-<arch>)
#   --repo <dir>          the repository to archive (default: this checkout)
#   --no-models           leave the model weights out: an upgrade bundle for a
#                         machine whose models volume already has them
#   --with-basal          also build basal's image and pre-seed its weights.
#                         Needs BASAL_MODEL_REVISION, and a builder of the
#                         target architecture: the image has no published
#                         form, so it is built here
#
# Nothing in it is a list kept by hand. The images are what Compose resolves
# for the release's own compose files, and the models are pulled by the
# release's own `ollama-models` job, so a bundle cannot disagree with the
# stack it installs.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/appliance/bundle/lib.sh
. "$script_dir/lib.sh"

VERSION=""
PLATFORM=""
REF=""
OUT=""
REPO="$(cd "$script_dir/../../.." && pwd)"
WITH_MODELS=1
WITH_BASAL=0
# The project the builder's own containers run in: the model pull, and the
# basal build. Its models volume is kept between runs, so the second bundle
# pulls only what changed.
BUILD_PROJECT="${RAGEN_BUNDLE_BUILD_PROJECT:-ragen-bundle-build}"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:?--version needs a value}"; shift 2 ;;
    --platform) PLATFORM="${2:?--platform needs a value}"; shift 2 ;;
    --ref) REF="${2:?--ref needs a value}"; shift 2 ;;
    --out) OUT="${2:?--out needs a value}"; shift 2 ;;
    --repo) REPO="${2:?--repo needs a value}"; shift 2 ;;
    --no-models) WITH_MODELS=0; shift ;;
    --with-basal) WITH_BASAL=1; shift ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "nieznana opcja: $1 (--help pokazuje listę)" ;;
  esac
done

# --- 1. What is being bundled -----------------------------------------------

[ -n "$VERSION" ] || die "podaj --version <X.Y.Z> (tag obrazów wydania)."
VERSION="${VERSION#v}"
valid_version "$VERSION" || die "nieprawidłowa wersja: $VERSION"
[ "$VERSION" != latest ] || die "paczka to jedno wydanie; 'latest' się przesuwa. Podaj numer wersji."
REF="${REF:-v$VERSION}"

for cmd in docker git tar sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || die "brak polecenia: $cmd"
done
docker info >/dev/null 2>&1 || die "docker nie odpowiada albo brak uprawnień."

host_arch="$(normalize_arch "$(docker info -f '{{.Architecture}}')")"
PLATFORM="${PLATFORM:-linux/$host_arch}"
valid_platform "$PLATFORM" || die "nieobsługiwana platforma: $PLATFORM (linux/arm64 albo linux/amd64)"
target_arch="$(platform_arch "$PLATFORM")"

git_sha="$(git -C "$REPO" rev-parse --verify --quiet "${REF}^{commit}")" ||
  die "nie ma '$REF' w $REPO. Pobierz tagi (git fetch --tags) albo podaj --ref."

OUT="${OUT:-$PWD/ragen-bundle-$VERSION-$target_arch}"
if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null)" ]; then
  die "$OUT już istnieje i nie jest pusty. Usuń go albo podaj inny --out."
fi
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

work="$(mktemp -d)"
models_started=0
cleanup() {
  if [ "$models_started" = 1 ]; then
    compose_build down >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

log "Paczka Ragen $VERSION dla $PLATFORM z $REF (${git_sha:0:12})"

# --- 2. The checkout ----------------------------------------------------------

# An offline machine cannot `git clone`, and the compose files, the route
# tables and the Ollama tag all come from the checkout, not from an image.
log "Archiwizuję repozytorium"
git -C "$REPO" archive --format=tar.gz -o "$OUT/checkout.tar.gz" "$git_sha"
mkdir -p "$work/checkout"
tar -xzf "$OUT/checkout.tar.gz" -C "$work/checkout"

release_bundle_dir="$work/checkout/infra/appliance/bundle"
[ -f "$release_bundle_dir/install-offline.sh" ] ||
  die "wydanie $REF nie ma instalatora offline (infra/appliance/bundle). Paczkę można zbudować dopiero z wydania, które go zawiera."
release_format="$(sed -n 's/^BUNDLE_FORMAT=//p' "$release_bundle_dir/lib.sh" | head -n1)"
[ "$release_format" = "$BUNDLE_FORMAT" ] ||
  die "wydanie czyta format paczki '$release_format', ten skrypt pisze $BUNDLE_FORMAT. Uruchom build-bundle.sh z repozytorium tego wydania."

# The installer travels with the bundle as the release shipped it, so the
# pair that wrote the manifest is the pair that reads it.
cp "$release_bundle_dir/install-offline.sh" "$release_bundle_dir/lib.sh" "$OUT/"
(cd "$work/checkout" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | xargs -d '\n' sha256sum) >"$OUT/checkout.sha256"

# The release's stack, as Compose resolves it: its own compose files, no
# `.env` of this machine, the release's tag.
compose_release() {
  (
    cd "$work/checkout" &&
      env -u COMPOSE_PROFILES -u COMPOSE_PROJECT_NAME \
        COMPOSE_FILE="$BUNDLE_COMPOSE_FILES" RAGEN_VERSION="$VERSION" \
        docker compose --env-file /dev/null "$@"
  )
}

# The same stack in the builder's own project, with Ollama's port unpublished
# so it cannot collide with a stack already running on this machine.
cat >"$work/build.override.yml" <<'EOF'
services:
  ollama:
    ports: !reset []
EOF
compose_build() {
  (
    cd "$work/checkout" &&
      env -u COMPOSE_PROFILES -u DOCKER_DEFAULT_PLATFORM \
        COMPOSE_PROJECT_NAME="$BUILD_PROJECT" \
        COMPOSE_FILE="$BUNDLE_COMPOSE_FILES:$work/build.override.yml" \
        RAGEN_VERSION="$VERSION" \
        docker compose --env-file /dev/null "$@"
  )
}

mapfile -t images < <(compose_release config --images | unique_images)
[ "${#images[@]}" -gt 0 ] || die "Compose nie podał żadnego obrazu."
for image in "${images[@]}"; do
  valid_image_ref "$image" || die "nieoczekiwana nazwa obrazu od Compose: $image"
done

config_json="$(compose_release config --format json)"
mapfile -t models < <(printf '%s\n' "$config_json" | compose_json_models)
[ "${#models[@]}" -gt 0 ] || die "nie znalazłem APPLIANCE_MODELS w konfiguracji usługi ollama-models."
gpu_check_image="$(compose_release config --images ollama | unique_images | head -n1)"

# --- 3. Model weights ---------------------------------------------------------

# Before the images: this step runs Ollama on THIS machine, so it needs the
# image of this machine's architecture, and step 4 may move the same tag to
# the target's.
: >"$OUT/models.txt"
if [ "$WITH_MODELS" = 1 ]; then
  log "Pobieram modele zadaniem ollama-models wydania: ${models[*]}"
  compose_build pull ollama
  models_started=1
  compose_build up -d ollama ollama-models
  compose_build logs -f --no-log-prefix ollama-models || true
  models_exit="$(docker inspect -f '{{.State.ExitCode}}' "$(compose_build ps -aq ollama-models)")"
  [ "$models_exit" = 0 ] || die "pobieranie modeli nie powiodło się (kod $models_exit)."

  log "Zapisuję wagi modeli"
  compose_build exec -T ollama tar -C /root/.ollama -cf - models >"$OUT/ollama-models.tar"
  compose_build down >/dev/null
  models_started=0
  printf '%s\n' "${models[@]}" >"$OUT/models.txt"
else
  warn "paczka bez modeli (--no-models): zadziała tylko tam, gdzie wolumen ollama_models już je ma."
fi

# --- 4. Images ----------------------------------------------------------------

log "Pobieram ${#images[@]} obrazów dla $PLATFORM"
: >"$OUT/images.tsv"
for image in "${images[@]}"; do
  docker pull --quiet --platform "$PLATFORM" "$image" >/dev/null
  # A registry that has no image for the platform does not always refuse: it
  # can hand over another architecture, which the target then emulates.
  got="$(docker image inspect -f '{{.Os}}/{{.Architecture}}' "$image")"
  [ "$got" = "$PLATFORM" ] || die "$image jest dla $got, nie dla $PLATFORM."
  printf '%s\t%s\t%s\n' "$image" "$(docker image inspect -f '{{.Id}}' "$image")" "$got" >>"$OUT/images.tsv"
done

# --- 5. basal (optional) ------------------------------------------------------

basal_image=""
basal_model=""
basal_revision=""
if [ "$WITH_BASAL" = 1 ]; then
  basal_revision="${BASAL_MODEL_REVISION:-}"
  [[ "$basal_revision" =~ ^[0-9a-f]{40}$ ]] ||
    die "--with-basal wymaga BASAL_MODEL_REVISION: pełnego, 40-znakowego commita wag."
  [ "$host_arch" = "$target_arch" ] ||
    die "obraz basal jest budowany lokalnie, więc --with-basal wymaga maszyny $target_arch (ta to $host_arch)."
  basal_model="$(BASAL_MODEL="${BASAL_MODEL:-}" compose_release --profile basal config --format json | compose_json_value BASAL_MODEL)"
  [ -n "$basal_model" ] || die "nie znalazłem BASAL_MODEL w konfiguracji usługi basal."
  basal_image="ragen-basal:$VERSION"
  basal_volume="$(volume_name "$BUILD_PROJECT" basal_models)"

  log "Buduję obraz basal i pobieram wagi $basal_model@${basal_revision:0:12}"
  compose_build --profile basal build basal
  docker tag "$BUILD_PROJECT-basal" "$basal_image"
  # The image's own entrypoint downloads the revision and stops: the same
  # code, and the same folder name, that serves it later.
  docker run --rm -v "$basal_volume:/models" \
    -e BASAL_MODEL="$basal_model" -e BASAL_MODEL_REVISION="$basal_revision" \
    -e BASAL_DOWNLOAD_ONLY=1 "$basal_image"
  docker run --rm -v "$basal_volume:/models:ro" --entrypoint tar "$basal_image" \
    -C /models -cf - . >"$OUT/basal-models.tar"
  printf '%s\t%s\t%s\n' "$basal_image" "$(docker image inspect -f '{{.Id}}' "$basal_image")" "$PLATFORM" >>"$OUT/images.tsv"
  images+=("$basal_image")
fi

# --- 6. The tarball and the manifest --------------------------------------------

log "Zapisuję obrazy do images.tar"
docker save -o "$OUT/images.tar" "${images[@]}"

cat >"$OUT/manifest.env" <<EOF
BUNDLE_FORMAT=$BUNDLE_FORMAT
RAGEN_VERSION=$VERSION
PLATFORM=$PLATFORM
GIT_REF=$REF
GIT_SHA=$git_sha
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
COMPOSE_FILES=$BUNDLE_COMPOSE_FILES
GPU_CHECK_IMAGE=$gpu_check_image
MODELS_INCLUDED=$WITH_MODELS
BASAL_IMAGE=$basal_image
BASAL_MODEL=$basal_model
BASAL_MODEL_REVISION=$basal_revision
EOF

log "Liczę sumy kontrolne"
digest="$(write_sums "$OUT")"

cat <<EOF

$(printf '\033[1;32m')Paczka gotowa:$(printf '\033[0m') $OUT ($(du -sh "$OUT" | cut -f1))

  Wersja:    $VERSION ($REF, ${git_sha:0:12})
  Platforma: $PLATFORM
  Obrazy:    ${#images[@]}
  Modele:    $([ "$WITH_MODELS" = 1 ] && echo "${models[*]}" || echo "brak (--no-models)")
  basal:     ${basal_image:-brak}

Suma pliku SHA256SUMS — przekaż ją inną drogą niż samą paczkę:

  $digest

Na maszynie bez sieci:

  bash <paczka>/install-offline.sh --expect-sha256 $digest --host <adres>
EOF
