#!/usr/bin/env bash
# Installs or upgrades the on-premises appliance from an offline bundle, on a
# machine with no network. Run it from the bundle build-bundle.sh wrote:
#
#   bash /media/usb/ragen-bundle-1.4.0-arm64/install-offline.sh --host <address>
#
# Options:
#   --dir <path>           the install directory (RAGEN_DIR, default /opt/ragen)
#   --host <name|ip>       address users open in the browser; a re-run or an
#                          upgrade without it keeps the address already set
#   --cpu                  no GPU check and no GPU overlay. An upgrade follows
#                          what the install already runs
#   --encrypt              encrypt thread messages with a generated local key
#   --expect-sha256 <sum>  the sum of SHA256SUMS the builder printed, sent by
#                          another road than the bundle. Without it the
#                          checksums catch a damaged copy, not a replaced one
#   --local-changes <keep|replace>
#                          an upgrade refuses to overwrite a file edited on
#                          this machine (a swapped model's route table) until
#                          told which version stays. The other one is saved
#   --verify-only          check the bundle and stop
#   --rollback             go back to the release that ran before the last
#                          upgrade: re-tag its images, put its files back,
#                          restart. Needs no bundle
#
# In this order, and it stops at the first step that fails:
#   1. every checksum is verified, before Docker is asked for anything;
#   2. on an upgrade, the images now running are given a name that survives
#      the load, and the files of the release now installed are saved;
#   3. `docker load`, the checkout, the environment;
#   4. the model weights go into the models volume, unless they are there;
#   5. the `migrate` job runs alone; the apps start only if it exits 0.
# Nothing is pulled and nothing is built. Safe to re-run.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/appliance/bundle/lib.sh
. "$script_dir/lib.sh"

BUNDLE="$script_dir"
DIR="${RAGEN_DIR:-/opt/ragen}"
HOST_ARG=""
USE_GPU=1
ENCRYPT=0
EXPECT=""
LOCAL_CHANGES=""
VERIFY_ONLY=0
ROLLBACK=0
# Never pull, never build: what is not in the bundle is not on this machine,
# and a pull that hangs on a network that is not there is the worst error.
OFFLINE=(--pull never --no-build)

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="${2:?--dir needs a value}"; shift 2 ;;
    --host) HOST_ARG="${2:?--host needs a value}"; shift 2 ;;
    --cpu) USE_GPU=0; shift ;;
    --encrypt) ENCRYPT=1; shift ;;
    --expect-sha256) EXPECT="${2:?--expect-sha256 needs a value}"; shift 2 ;;
    --local-changes) LOCAL_CHANGES="${2:?--local-changes needs keep or replace}"; shift 2 ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --rollback) ROLLBACK=1; shift ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "nieznana opcja: $1 (--help pokazuje listę)" ;;
  esac
done

case "$LOCAL_CHANGES" in
  "" | keep | replace) ;;
  *) die "--local-changes przyjmuje keep albo replace, nie '$LOCAL_CHANGES'" ;;
esac

STATE="$DIR/.ragen-bundle"

compose() {
  (cd "$DIR" && docker compose "$@")
}

check_host() {
  local cmd compose_version
  for cmd in docker tar sha256sum; do
    command -v "$cmd" >/dev/null 2>&1 || die "brak polecenia: $cmd"
  done
  docker info >/dev/null 2>&1 ||
    die "docker nie odpowiada albo brak uprawnień. Dodaj użytkownika do grupy: sudo usermod -aG docker \$USER, potem zaloguj się ponownie."
  compose_version="$(docker compose version --short 2>/dev/null || true)"
  [ -n "$compose_version" ] || die "brak Docker Compose v2 (docker compose)."
  if [ "$(printf '%s\n2.24.0\n' "${compose_version#v}" | sort -V | head -n1)" != "2.24.0" ]; then
    die "Docker Compose $compose_version jest za stary; wymagany >= 2.24."
  fi
}

# The `migrate` job alone, then everything. The apps of an upgrade keep
# running the previous release until the job has exited 0, which the
# additive-migrations rule (runbook, section 7) makes safe.
start_stack() {
  local migrate_exit web_port code=""

  log "Uruchamiam bazę i migracje (zadanie migrate)"
  compose up -d "${OFFLINE[@]}" --wait postgres
  compose up -d "${OFFLINE[@]}" --no-deps --force-recreate migrate
  compose logs -f --no-log-prefix migrate || true
  migrate_exit="$(docker inspect -f '{{.State.ExitCode}}' "$(compose ps -aq migrate)")"
  if [ "$migrate_exit" != 0 ]; then
    die "migracje nie powiodły się (kod $migrate_exit); aplikacji nie ruszam. Zobacz: docker compose logs migrate. Nie uruchamiaj 'prisma migrate reset'. Powrót do poprzedniego wydania: install-offline.sh --rollback."
  fi

  log "Uruchamiam Ragena"
  compose up -d "${OFFLINE[@]}"

  web_port="$(get_env "$DIR/.env" WEB_PORT)"
  web_port="${web_port:-3000}"
  log "Czekam, aż web odpowie na http://localhost:${web_port}"
  for _ in $(seq 1 "${RAGEN_WEB_WAIT_TRIES:-90}"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${web_port}/" || true)"
    if [ -n "$code" ] && [ "$code" != 000 ] && [ "$code" -lt 500 ]; then
      return 0
    fi
    sleep "${RAGEN_WEB_WAIT_SLEEP:-5}"
  done
  compose ps -a
  die "web nie odpowiada. Zobacz: docker compose logs migrate web api"
}

# --- Rollback -------------------------------------------------------------------

if [ "$ROLLBACK" = 1 ]; then
  check_host
  previous="$(get_env "$STATE/state.env" PREVIOUS_VERSION)"
  current="$(get_env "$STATE/state.env" CURRENT_VERSION)"
  [ -n "$previous" ] ||
    die "w $STATE nie ma zapisanego poprzedniego wydania. Cofnąć można tylko ostatnią aktualizację z paczki."
  valid_version "$previous" || die "nieprawidłowa wersja w $STATE/state.env"
  snapshot="$STATE/checkout-$previous.tar.gz"
  tsv="$STATE/rollback-images.tsv"
  [ -f "$snapshot" ] || die "brak $snapshot"
  [ -f "$tsv" ] || die "brak $tsv"

  # All of them, before the first tag moves.
  while IFS=$'\t' read -r image kept _; do
    docker image inspect "$kept" >/dev/null 2>&1 ||
      die "nie ma już obrazu $kept (usunięty np. przez 'docker image prune -a'). Bez niego powrót wymaga przywrócenia backupu (runbook, sekcja 4)."
  done <"$tsv"

  log "Wracam z ${current:-?} do $previous"
  while IFS=$'\t' read -r image kept _; do
    docker tag "$kept" "$image"
  done <"$tsv"
  tar -xzf "$snapshot" -C "$DIR"
  if [ -f "$STATE/checkout-$previous.sha256" ]; then
    cp "$STATE/checkout-$previous.sha256" "$STATE/checkout.sha256"
  else
    rm -f "$STATE/checkout.sha256"
  fi
  set_env "$DIR/.env" RAGEN_VERSION "$previous"
  set_env "$STATE/state.env" CURRENT_VERSION "$previous"
  set_env "$STATE/state.env" PREVIOUS_VERSION ""
  printf '%s rollback %s -> %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${current:-?}" "$previous" >>"$STATE/history.log"

  start_stack
  log "Działa wydanie $previous. Starsze zadanie migrate widzi w bazie migracje, których samo nie ma — sprawdź 'docker compose logs migrate' (runbook, sekcja 7)."
  exit 0
fi

# --- 1. The bundle, before anything else ----------------------------------------

log "Sprawdzam paczkę: $BUNDLE"
command -v sha256sum >/dev/null 2>&1 || die "brak polecenia: sha256sum"
problem="$(verify_bundle "$BUNDLE" "$EXPECT")" ||
  die "paczka odrzucona, niczego nie zmieniłem: $problem"
problem="$(validate_manifest "$BUNDLE")" ||
  die "paczka odrzucona, niczego nie zmieniłem: $problem"
extra="$(unlisted_files "$BUNDLE")"
if [ -n "$extra" ]; then
  warn "pliki w katalogu paczki, których nie ma w $BUNDLE_SUMS (pomijam je): $(printf '%s' "$extra" | tr '\n' ' ')"
fi
if [ -z "$EXPECT" ]; then
  warn "bez --expect-sha256 sumy wykrywają uszkodzoną kopię, nie podmienioną. Suma SHA256SUMS tej paczki: $(sums_digest "$BUNDLE")"
fi

VERSION="$(get_env "$BUNDLE/manifest.env" RAGEN_VERSION)"
PLATFORM="$(get_env "$BUNDLE/manifest.env" PLATFORM)"
GPU_CHECK_IMAGE="$(get_env "$BUNDLE/manifest.env" GPU_CHECK_IMAGE)"
BASAL_IMAGE="$(get_env "$BUNDLE/manifest.env" BASAL_IMAGE)"
log "Paczka poprawna: Ragen $VERSION dla $PLATFORM, $(wc -l <"$BUNDLE/images.tsv" | tr -d ' ') obrazów, $(wc -l <"$BUNDLE/models.txt" | tr -d ' ') modeli"

if [ "$VERIFY_ONLY" = 1 ]; then
  exit 0
fi

# --- 2. The host ----------------------------------------------------------------

check_host
host_arch="$(normalize_arch "$(docker info -f '{{.Architecture}}')")"
# Docker would load the images and run them under emulation without a word
# (docs/lessons/a-single-architecture-image-is-emulated-rather-than-refused.md).
[ "$host_arch" = "$(platform_arch "$PLATFORM")" ] ||
  die "paczka jest dla $PLATFORM, a ta maszyna to linux/$host_arch. Zbuduj paczkę z --platform linux/$host_arch."

# --- 3. Fresh install, upgrade or re-run ----------------------------------------

mode=fresh
installed=""
# An install is a checkout with Compose's `.env` beside it. A first run that
# stopped before writing one (no GPU, say) is still a fresh install.
if [ -f "$DIR/docker-compose.appliance.yml" ] && [ -f "$DIR/.env" ]; then
  installed="$(get_env "$DIR/.env" RAGEN_VERSION)"
  installed="${installed:-latest}"
  if [ "$installed" = "$VERSION" ]; then
    mode=rerun
  else
    mode=upgrade
  fi
fi
case "$mode" in
  fresh) log "Nowa instalacja w $DIR" ;;
  rerun) log "W $DIR jest już wydanie $VERSION — dokańczam albo powtarzam instalację" ;;
  upgrade) log "Aktualizacja w $DIR: $installed -> $VERSION" ;;
esac

# An upgrade follows the install it finds: the same compose files (a PII
# overlay the operator added stays), and the GPU overlay only if it is there.
kept_compose_file=""
if [ "$mode" != fresh ]; then
  kept_compose_file="$(get_env "$DIR/.env" COMPOSE_FILE)"
  if [ -n "$kept_compose_file" ] && [[ "$kept_compose_file" != *docker-compose.appliance.gpu.yml* ]]; then
    USE_GPU=0
  fi
fi

# Files edited on this machine since the installed release put them there.
changed=""
if [ "$mode" != fresh ]; then
  if [ -f "$STATE/checkout.sha256" ]; then
    changed="$(changed_files "$DIR" "$STATE/checkout.sha256")"
  elif [ -d "$DIR/.git" ] && command -v git >/dev/null 2>&1; then
    changed="$(git -C "$DIR" diff --name-only HEAD 2>/dev/null || true)"
  else
    warn "nie wiem, co zmieniono w $DIR od instalacji (brak listy sum i repozytorium git). Poprzednie pliki zapisuję w $STATE."
  fi
  if [ -n "$changed" ] && [ -z "$LOCAL_CHANGES" ]; then
    die "pliki zmienione na tej maszynie, które aktualizacja by nadpisała:
$(printf '%s\n' "$changed" | sed 's/^/    /')
Uruchom ponownie z --local-changes keep (zostają Twoje wersje, wersje wydania obok jako <plik>.release-$VERSION) albo --local-changes replace (wchodzą wersje wydania, Twoje trafiają do $STATE/local-changes). Niczego nie zmieniłem."
  fi
fi

# --- 4. Keep the way back (upgrade only) ----------------------------------------

if [ "$mode" = upgrade ]; then
  mkdir -p "$STATE"
  if [ "$(get_env "$STATE/state.env" PREVIOUS_VERSION)" = "$installed" ] && [ -f "$STATE/rollback-images.tsv" ]; then
    # An earlier, interrupted run of this upgrade already did it. Doing it
    # again after `docker load` would keep the NEW postgres under the old name.
    log "Droga powrotu do $installed jest już zapisana"
  else
    log "Zapisuję drogę powrotu do $installed"
    if [ -f "$STATE/rollback-images.tsv" ]; then
      # The release before the one being replaced: one step back is kept.
      while IFS=$'\t' read -r _ kept _; do
        docker rmi "$kept" >/dev/null 2>&1 || true
      done <"$STATE/rollback-images.tsv"
    fi
    # Read before the loop, so a checkout Compose cannot parse stops the
    # upgrade here instead of leaving it with no way back.
    old_images="$(compose config --images | unique_images)"
    : >"$STATE/rollback-images.tsv.tmp"
    while IFS= read -r image; do
      kept="$(rollback_ref "$image" "$installed")" || continue
      if docker image inspect "$image" >/dev/null 2>&1; then
        docker tag "$image" "$kept"
        printf '%s\t%s\t%s\n' "$image" "$kept" "$(docker image inspect -f '{{.Id}}' "$image")" >>"$STATE/rollback-images.tsv.tmp"
      fi
    done <<<"$old_images"
    tar -czf "$STATE/checkout-$installed.tar.gz" -C "$DIR" \
      --exclude=./.ragen-bundle --exclude=./.git --exclude=node_modules \
      --exclude='.env' --exclude='.env.*' --exclude=./volumes .
    if [ -f "$STATE/checkout.sha256" ]; then
      cp "$STATE/checkout.sha256" "$STATE/checkout-$installed.sha256"
    fi
    mv "$STATE/rollback-images.tsv.tmp" "$STATE/rollback-images.tsv"
    set_env "$STATE/state.env" PREVIOUS_VERSION "$installed"
  fi
fi

if [ -n "$changed" ]; then
  while IFS= read -r file; do
    [ -f "$DIR/$file" ] || continue
    mkdir -p "$STATE/local-changes/$(dirname "$file")"
    cp -p "$DIR/$file" "$STATE/local-changes/$file"
  done <<<"$changed"
fi

# --- 5. Images ------------------------------------------------------------------

log "Ładuję obrazy (docker load)"
docker load -i "$BUNDLE/images.tar" >/dev/null
while IFS=$'\t' read -r image id platform; do
  got="$(docker image inspect -f '{{.Os}}/{{.Architecture}}' "$image" 2>/dev/null || true)"
  [ -n "$got" ] || die "po 'docker load' nie ma obrazu $image, choć manifest go wymienia."
  [ "$got" = "$platform" ] || die "$image jest dla $got, manifest mówi $platform."
  if [ "$(docker image inspect -f '{{.Id}}' "$image")" != "$id" ]; then
    warn "$image ma inny identyfikator niż w manifeście. Sumy images.tar się zgadzały, więc to zwykle inny magazyn obrazów (containerd) niż na maszynie budującej."
  fi
done <"$BUNDLE/images.tsv"

# --- 6. The checkout ------------------------------------------------------------

log "Rozpakowuję repozytorium do $DIR"
mkdir -p "$DIR" "$STATE"
tar -xzf "$BUNDLE/checkout.tar.gz" -C "$DIR"
cp "$BUNDLE/checkout.sha256" "$STATE/checkout.sha256"

if [ -n "$changed" ]; then
  while IFS= read -r file; do
    [ -f "$STATE/local-changes/$file" ] || continue
    if [ "$LOCAL_CHANGES" = keep ]; then
      if [ -f "$DIR/$file" ]; then
        cp -p "$DIR/$file" "$DIR/$file.release-$VERSION"
      fi
      cp -p "$STATE/local-changes/$file" "$DIR/$file"
      warn "zostawiam Twoją wersję: $file (wersja wydania: $file.release-$VERSION)"
    else
      warn "wersja wydania zastąpiła: $file (Twoja: $STATE/local-changes/$file)"
    fi
  done <<<"$changed"
fi

# --- 7. Environment ---------------------------------------------------------------

# install-spark.sh owns the environment — the secrets, the admin file, the
# addresses, COMPOSE_FILE — so there is one list of secrets, not two.
env_args=(--env-only --version "$VERSION")
if [ -n "$HOST_ARG" ]; then
  env_args+=(--host "$HOST_ARG")
fi
if [ "$USE_GPU" = 0 ]; then
  env_args+=(--cpu)
fi
if [ "$ENCRYPT" = 1 ]; then
  env_args+=(--encrypt)
fi
RAGEN_GPU_CHECK_IMAGE="$GPU_CHECK_IMAGE" bash "$DIR/infra/appliance/install-spark.sh" "${env_args[@]}"
if [ -n "$kept_compose_file" ]; then
  set_env "$DIR/.env" COMPOSE_FILE "$kept_compose_file"
fi

# --- 8. Model weights -------------------------------------------------------------

log "Uruchamiam Ollamę i sprawdzam modele"
compose up -d "${OFFLINE[@]}" --wait ollama

# What this install's `ollama-models` job will ask for: with nothing missing
# it exits 0 without a network, and the apps wait for exactly that.
wanted_models="$(compose config --format json | compose_json_models)"
[ -n "$wanted_models" ] || die "nie znalazłem APPLIANCE_MODELS w konfiguracji usługi ollama-models."
missing_models() {
  local model
  while IFS= read -r model; do
    if ! compose exec -T ollama ollama show "$model" </dev/null >/dev/null 2>&1; then
      printf '%s\n' "$model"
    fi
  done <<<"$wanted_models"
}

missing="$(missing_models)"
if [ -n "$missing" ] && [ -f "$BUNDLE/ollama-models.tar" ]; then
  log "Wgrywam wagi modeli do wolumenu ollama_models"
  compose exec -T ollama tar -C /root/.ollama -xf - <"$BUNDLE/ollama-models.tar"
  missing="$(missing_models)"
fi
if [ -n "$missing" ]; then
  die "brakuje modeli, których ta instalacja wymaga, a paczka ich nie ma: $(printf '%s' "$missing" | tr '\n' ' '). Zbuduj paczkę z modelami (bez --no-models) albo z tym samym APPLIANCE_MODELS, które jest w $DIR/.env."
fi
log "Modele na miejscu"

# --- 9. basal (only if the bundle carries it) -------------------------------------

if [ -n "$BASAL_IMAGE" ]; then
  project="$(compose config --format json | compose_json_project)"
  basal_volume="$(volume_name "$project" basal_models)"
  log "Wgrywam wagi basal do wolumenu $basal_volume"
  # The service has no published image: Compose looks for <project>-basal.
  docker tag "$BASAL_IMAGE" "$project-basal"
  if ! docker volume inspect "$basal_volume" >/dev/null 2>&1; then
    docker volume create \
      --label "com.docker.compose.project=$project" \
      --label "com.docker.compose.volume=basal_models" \
      "$basal_volume" >/dev/null
  fi
  docker run --rm -i --pull never -v "$basal_volume:/models" --entrypoint tar "$BASAL_IMAGE" \
    -C /models -xf - <"$BUNDLE/basal-models.tar"
  set_env "$DIR/.env" BASAL_MODEL "$(get_env "$BUNDLE/manifest.env" BASAL_MODEL)"
  set_env "$DIR/.env" BASAL_MODEL_REVISION "$(get_env "$BUNDLE/manifest.env" BASAL_MODEL_REVISION)"
fi

# --- 10. Migrations first, then the apps ------------------------------------------

start_stack

set_env "$STATE/state.env" CURRENT_VERSION "$VERSION"
printf '%s %s %s -> %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$mode" "${installed:-none}" "$VERSION" >>"$STATE/history.log"

cat <<EOF

$(printf '\033[1;32m')Ragen $VERSION działa.$(printf '\033[0m')

  Otwórz:   $(get_env "$DIR/.env.local" APP_URL)
  Katalog:  $DIR  (docker compose ps | logs -f | down)
EOF

previous="$(get_env "$STATE/state.env" PREVIOUS_VERSION)"
if [ -n "$previous" ]; then
  cat <<EOF
  Powrót:   bash $DIR/infra/appliance/bundle/install-offline.sh --dir $DIR --rollback
            wraca do $previous. Jego obrazy są zachowane pod nazwami
            ragen-rollback/…; 'docker image prune -a' je usuwa.
EOF
fi
if [ -n "$BASAL_IMAGE" ]; then
  cat <<EOF
  basal:    wagi są w wolumenie, usługa nie jest uruchomiona. Włącz ją:
            docker compose --profile basal up -d --pull never --no-build basal
            i ustaw BASAL_URL=http://basal:8000 w .env.local.
EOF
fi
