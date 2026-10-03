#!/usr/bin/env bash
set -euo pipefail
die() { echo "image CI: $*" >&2; exit 1; }
[[ "${RUNNER_ENVIRONMENT:-}" == github-hosted && "${RUNNER_OS:-}" == Linux && "$(uname -s)" == Linux ]] || die 'requires GitHub hosted Linux'
metrics() { df -B1 / /tmp "${RUNNER_TEMP:?}"; docker system df; }
identity() {
  local image_id revision
  image_id="$(docker image inspect --format '{{.Id}}' "${IMAGE_REF:?}")"
  revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE_REF")"
  [[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ && "$revision" == "${GITHUB_SHA:?}" ]] || die 'image ID or revision invalid'
  [[ -z "${EXPECTED_IMAGE_ID:-}" || "$image_id" == "$EXPECTED_IMAGE_ID" ]] || die 'image ID changed'
  echo "Exact image: $image_id revision=$revision"
  docker image inspect --format 'Image tags={{json .RepoTags}} Size={{.Size}}' "$IMAGE_REF"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "image_id=$image_id" >> "$GITHUB_OUTPUT"; fi
}
case "${1:-}" in
  cleanup)
    metrics
    before="$(df -B1 --output=avail / | tail -n 1 | tr -d '[:space:]')"
    sdk_paths=(/usr/local/lib/android/sdk /usr/share/dotnet)
    # Validate every existing path before any deletion. Never search alternative installations.
    for sdk in "${sdk_paths[@]}"; do
      if test -d "$sdk"; then
        [[ "$(realpath -e -- "$sdk")" == "$sdk" ]] || die "SDK path resolution refused: $sdk"
        du -sx --block-size=1 -- "$sdk"
      else
        echo "SDK absent: $sdk"
      fi
    done
    for sdk in "${sdk_paths[@]}"; do
      if test -d "$sdk"; then
        [[ "$(realpath -e -- "$sdk")" == "$sdk" ]] || die "SDK path resolution refused: $sdk"
        sudo rm -rf -- "$sdk"
      fi
    done
    metrics
    after="$(df -B1 --output=avail / | tail -n 1 | tr -d '[:space:]')"
    [[ "$before" =~ ^[0-9]+$ && "$after" =~ ^[0-9]+$ ]] || die 'cannot measure reclaimed bytes'
    echo "Root filesystem bytes reclaimed=$((after - before))"
    ;;
  snapshot) metrics ;;
  identity) identity ;;
  reserve)
    identity
    size="$(docker image inspect --format '{{.Size}}' "$IMAGE_REF")"
    [[ "$size" =~ ^[0-9]+$ && "$size" -gt 0 && "$size" -lt 1000000000000 ]] || die 'invalid image size'
    # Provisional headroom, pending measurement on the hosted runner: max(8 GiB, 3*image + 4 GiB).
    reserve=$((3 * size + 4294967296))
    ((reserve >= 8589934592)) || reserve=8589934592
    metrics
    free="$(df -B1 --output=avail "${RUNNER_TEMP:?}" | tail -n 1 | tr -d '[:space:]')"
    [[ "$free" =~ ^[0-9]+$ ]] || die 'cannot measure scanner temporary filesystem'
    echo "Scanner temp free=$free reserve=$reserve image_bytes=$size (provisional)"
    ((free >= reserve)) || die 'insufficient scanner temporary filesystem reserve'
    ;;
  *) die 'expected cleanup, reserve or identity' ;;
esac
