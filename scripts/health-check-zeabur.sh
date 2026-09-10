#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

usage() {
  cat <<'USAGE'
Usage: health-check-zeabur.sh API_URL WEB_URL
       health-check-zeabur.sh --api-url API_URL --web-url WEB_URL

The URLs must be http(s) origins. They may also be supplied as ZEABUR_API_URL
and ZEABUR_WEB_URL. The check fails if any expected status is not observed.
USAGE
}

die() {
  printf 'health-check-zeabur: %s\n' "$*" >&2
  exit 1
}

require_url() {
  local name=$1
  local value=$2
  [[ "$value" != *'@'* ]] || die "$name must not contain URL credentials"
  [[ "$value" =~ ^https?://[^/[:space:]?\#]+/?$ ]] || die "$name must be an http(s) origin without a path or query"
}

API_URL=${ZEABUR_API_URL:-}
WEB_URL=${ZEABUR_WEB_URL:-}
POSITIONAL=()
while (($# > 0)); do
  case "$1" in
    --api-url) [[ $# -ge 2 ]] || die '--api-url requires a value'; API_URL=$2; shift 2 ;;
    --web-url) [[ $# -ge 2 ]] || die '--web-url requires a value'; WEB_URL=$2; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    --*) die "unknown option: $1" ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done
if ((${#POSITIONAL[@]} > 2)); then
  die 'expected at most API_URL and WEB_URL positional arguments'
fi
if ((${#POSITIONAL[@]} >= 1)); then
  API_URL=${POSITIONAL[0]}
fi
if ((${#POSITIONAL[@]} >= 2)); then
  WEB_URL=${POSITIONAL[1]}
fi

[[ -n "$API_URL" ]] || { usage >&2; exit 64; }
[[ -n "$WEB_URL" ]] || { usage >&2; exit 64; }
require_url ZEABUR_API_URL "$API_URL"
require_url ZEABUR_WEB_URL "$WEB_URL"
command -v curl >/dev/null 2>&1 || die 'required command not found: curl'

API_URL=${API_URL%/}
WEB_URL=${WEB_URL%/}
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/zeabur-health.XXXXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

check_endpoint() {
  local label=$1
  local url=$2
  local expected=$3
  local body_file="$TMP_DIR/${label//[^A-Za-z0-9_.-]/_}.body"
  local status

  if ! status=$(curl \
    --silent --show-error \
    --connect-timeout 5 --max-time 15 \
    --retry 1 --retry-delay 1 \
    --output "$body_file" --write-out '%{http_code}' \
    "$url"); then
    printf 'FAIL %-24s transport error (%s)\n' "$label" "$url" >&2
    return 1
  fi

  if [[ "$status" != "$expected" ]]; then
    printf 'FAIL %-24s expected HTTP %s, got %s (%s)\n' "$label" "$expected" "$status" "$url" >&2
    if [[ -s "$body_file" ]]; then
      sed -n '1,20p' "$body_file" >&2
    fi
    return 1
  fi

  printf 'PASS %-24s HTTP %s\n' "$label" "$status"
}

printf 'Zeabur release health check\n'
printf '  API: %s\n' "$API_URL"
printf '  Web: %s\n\n' "$WEB_URL"

failures=0
check_endpoint 'api-health' "$API_URL/health" 200 || failures=$((failures + 1))
check_endpoint 'api-ready' "$API_URL/ready" 200 || failures=$((failures + 1))
check_endpoint 'api-legacy-health' "$API_URL/api/v1/health" 200 || failures=$((failures + 1))
check_endpoint 'api-unauthenticated' "$API_URL/api/v1/auth/me" 401 || failures=$((failures + 1))
check_endpoint 'web-healthz' "$WEB_URL/healthz" 200 || failures=$((failures + 1))
check_endpoint 'web-legacy-health' "$WEB_URL/api/v1/health" 200 || failures=$((failures + 1))
check_endpoint 'web-capabilities' "$WEB_URL/api/v1/settings/capabilities" 200 || failures=$((failures + 1))
check_endpoint 'web-unauthenticated' "$WEB_URL/api/v1/auth/me" 401 || failures=$((failures + 1))

if ((failures > 0)); then
  printf '\nHealth check failed: %d endpoint(s) did not meet the release contract.\n' "$failures" >&2
  exit 1
fi

printf '\nAll release health checks passed.\n'
