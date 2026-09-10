#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
cd "$ROOT_DIR"

usage() {
  cat <<'USAGE'
Usage:
  deploy-zeabur.sh [options]

Required values may be supplied with the matching ZEABUR_* environment variable
or the option shown below. The script is a dry-run unless --execute is passed.

Options:
  --project-id ID          ZEABUR_PROJECT_ID
  --environment-id ID      ZEABUR_ENVIRONMENT_ID
  --api-service-id ID      ZEABUR_API_SERVICE_ID
  --worker-service-id ID   ZEABUR_WORKER_SERVICE_ID
  --web-service-id ID      ZEABUR_WEB_SERVICE_ID
  --branch NAME            ZEABUR_GIT_BRANCH (defaults to the current branch)
  --remote NAME            ZEABUR_GIT_REMOTE (defaults to origin)
  --api-url URL            ZEABUR_API_URL (required by --health-check)
  --web-url URL            ZEABUR_WEB_URL (required by --health-check)
  --push                   Push the checked commit before deploying
  --migrate                Run the explicit API migration command after deploy
  --health-check           Run scripts/health-check-zeabur.sh after deploy
  --execute                Perform push/deploy/migration/health operations
  --help                   Show this help

Examples:
  ZEABUR_PROJECT_ID=... ZEABUR_ENVIRONMENT_ID=... \
  ZEABUR_API_SERVICE_ID=... ZEABUR_WORKER_SERVICE_ID=... \
  ZEABUR_WEB_SERVICE_ID=... ./scripts/deploy-zeabur.sh

  ./scripts/deploy-zeabur.sh --project-id ... --environment-id ... \
    --api-service-id ... --worker-service-id ... --web-service-id ... \
    --api-url https://api.example --web-url https://web.example \
    --execute --push --migrate --health-check
USAGE
}

die() {
  printf 'deploy-zeabur: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

require_id() {
  local name=$1
  local value=$2
  [[ -n "$value" ]] || die "$name is required (use --${name//_/-} or the matching ZEABUR_* variable)"
  [[ "$value" =~ ^[A-Za-z0-9._:-]+$ ]] || die "$name contains unsupported characters"
}

require_url() {
  local name=$1
  local value=$2
  [[ "$value" =~ ^https?://[^/[:space:]?\#]+/?$ ]] || die "$name must be an http(s) origin without a path or query"
}

PROJECT_ID=${ZEABUR_PROJECT_ID:-}
ENVIRONMENT_ID=${ZEABUR_ENVIRONMENT_ID:-}
API_SERVICE_ID=${ZEABUR_API_SERVICE_ID:-}
WORKER_SERVICE_ID=${ZEABUR_WORKER_SERVICE_ID:-}
WEB_SERVICE_ID=${ZEABUR_WEB_SERVICE_ID:-}
BRANCH=${ZEABUR_GIT_BRANCH:-}
REMOTE=${ZEABUR_GIT_REMOTE:-origin}
API_URL=${ZEABUR_API_URL:-}
WEB_URL=${ZEABUR_WEB_URL:-}
EXECUTE=0
PUSH=0
MIGRATE=0
HEALTH_CHECK=0

while (($# > 0)); do
  case "$1" in
    --project-id) [[ $# -ge 2 ]] || die '--project-id requires a value'; PROJECT_ID=$2; shift 2 ;;
    --environment-id) [[ $# -ge 2 ]] || die '--environment-id requires a value'; ENVIRONMENT_ID=$2; shift 2 ;;
    --api-service-id) [[ $# -ge 2 ]] || die '--api-service-id requires a value'; API_SERVICE_ID=$2; shift 2 ;;
    --worker-service-id) [[ $# -ge 2 ]] || die '--worker-service-id requires a value'; WORKER_SERVICE_ID=$2; shift 2 ;;
    --web-service-id) [[ $# -ge 2 ]] || die '--web-service-id requires a value'; WEB_SERVICE_ID=$2; shift 2 ;;
    --branch) [[ $# -ge 2 ]] || die '--branch requires a value'; BRANCH=$2; shift 2 ;;
    --remote) [[ $# -ge 2 ]] || die '--remote requires a value'; REMOTE=$2; shift 2 ;;
    --api-url) [[ $# -ge 2 ]] || die '--api-url requires a value'; API_URL=$2; shift 2 ;;
    --web-url) [[ $# -ge 2 ]] || die '--web-url requires a value'; WEB_URL=$2; shift 2 ;;
    --push) PUSH=1; shift ;;
    --migrate) MIGRATE=1; shift ;;
    --health-check) HEALTH_CHECK=1; shift ;;
    --execute) EXECUTE=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

require_command git

[[ -n "$BRANCH" ]] || BRANCH=$(git branch --show-current)
[[ -n "$BRANCH" ]] || die 'detached HEAD is not deployable; provide --branch explicitly'
[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || die 'branch name contains unsupported characters'
[[ "$REMOTE" =~ ^[A-Za-z0-9._:/-]+$ ]] || die 'remote name contains unsupported characters'

require_id ZEABUR_PROJECT_ID "$PROJECT_ID"
require_id ZEABUR_ENVIRONMENT_ID "$ENVIRONMENT_ID"
require_id ZEABUR_API_SERVICE_ID "$API_SERVICE_ID"
require_id ZEABUR_WORKER_SERVICE_ID "$WORKER_SERVICE_ID"
require_id ZEABUR_WEB_SERVICE_ID "$WEB_SERVICE_ID"
[[ "$API_SERVICE_ID" != "$WORKER_SERVICE_ID" ]] || die 'API and Worker service IDs must be different'
[[ "$API_SERVICE_ID" != "$WEB_SERVICE_ID" ]] || die 'API and Web service IDs must be different'
[[ "$WORKER_SERVICE_ID" != "$WEB_SERVICE_ID" ]] || die 'Worker and Web service IDs must be different'

if ((HEALTH_CHECK)); then
  [[ -n "$API_URL" ]] || die '--health-check requires --api-url or ZEABUR_API_URL'
  [[ -n "$WEB_URL" ]] || die '--health-check requires --web-url or ZEABUR_WEB_URL'
  require_url ZEABUR_API_URL "$API_URL"
  require_url ZEABUR_WEB_URL "$WEB_URL"
fi

CURRENT_BRANCH=$(git branch --show-current)
[[ "$CURRENT_BRANCH" == "$BRANCH" ]] || die "current branch '$CURRENT_BRANCH' does not match requested branch '$BRANCH'"

printf 'Zeabur deployment plan\n'
printf '  project:     %s\n' "$PROJECT_ID"
printf '  environment: %s\n' "$ENVIRONMENT_ID"
printf '  branch:      %s\n' "$BRANCH"
printf '  commit:      '
COMMIT_SHA=$(git rev-parse HEAD)
[[ "$COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]] || die 'HEAD is not a complete 40-character commit SHA'
printf '%s\n' "$COMMIT_SHA"
printf '  services:    api=%s worker=%s web=%s\n' "$API_SERVICE_ID" "$WORKER_SERVICE_ID" "$WEB_SERVICE_ID"

printf '\nRequired production variables are managed in Zeabur, never generated by this script:\n'
printf '  DATABASE_URL, REDIS_URL, APP_ENCRYPTION_KEY (64 hex chars), JWT_SECRET, APP_PLATFORM_CURRENCY\n'
printf '  RELEASE_GIT_SHA=%s\n' "$COMMIT_SHA"
printf '  Keep fulfillment/order/projection/migration/health execution disabled until provider gates pass.\n'

if ((PUSH)); then
  printf '  push:        %s/%s\n' "$REMOTE" "$BRANCH"
fi
if ((MIGRATE)); then
  printf '  migration:   API service exec after deployment\n'
fi
if ((HEALTH_CHECK)); then
  printf '  health:      %s and %s\n' "$API_URL" "$WEB_URL"
fi

if ((EXECUTE == 0)); then
  printf '\nDry-run only. Re-run with --execute after reviewing the plan.\n'
  exit 0
fi

require_command zeabur
require_command pnpm
pnpm run predeploy:check

if ((PUSH)); then
  git push --set-upstream "$REMOTE" "$BRANCH"
fi

deploy_service() {
  local service_id=$1
  printf 'Deploying service %s...\n' "$service_id"
  zeabur deploy \
    --project-id "$PROJECT_ID" \
    --service-id "$service_id" \
    --environment-id "$ENVIRONMENT_ID" \
    -i=false
}

deploy_service "$API_SERVICE_ID"

if ((MIGRATE)); then
  printf 'Running database migrations in API service...\n'
  zeabur service exec \
    --id "$API_SERVICE_ID" \
    --env-id "$ENVIRONMENT_ID" \
    -- sh -c 'cd /app && pnpm --filter @ipeasy/db migrate:deploy'
fi

deploy_service "$WORKER_SERVICE_ID"
deploy_service "$WEB_SERVICE_ID"

if ((HEALTH_CHECK)); then
  "$SCRIPT_DIR/health-check-zeabur.sh" "$API_URL" "$WEB_URL"
fi

printf 'Zeabur deployment completed for commit %s.\n' "$COMMIT_SHA"
