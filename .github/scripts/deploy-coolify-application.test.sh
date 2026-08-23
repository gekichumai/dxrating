#!/usr/bin/env bash

set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
temporary_directory=$(mktemp -d)
trap 'rm -rf -- "$temporary_directory"' EXIT

export PATH="${repository_root}/.github/scripts/test-fixtures:${PATH}"
export COOLIFY_DEPLOY_URL='https://coolify.test/api/v1/deploy?uuid=app'
export COOLIFY_TOKEN='test-token'
export CF_ACCESS_CLIENT_ID='test-access-id'
export CF_ACCESS_CLIENT_SECRET='test-access-secret'
export EXPECTED_COMMIT='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
export EXPECTED_IMAGE_DIGEST='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
export EXPECTED_COMPOSE_LOCATION='apps/backend/docker-compose.prod.yml'
export PRODUCTION_BASE_URL='https://backend.test'
export DEPLOYMENT_TIMEOUT_SECONDS=60
export DEPLOYMENT_POLL_SECONDS=1
export READINESS_TIMEOUT_SECONDS=30
export RECONCILIATION_TIMEOUT_SECONDS=30

export MOCK_CURL_STATE_FILE="${temporary_directory}/success.state"
: >"$MOCK_CURL_STATE_FILE"
MOCK_CURL_SCENARIO=success bash "${repository_root}/.github/scripts/deploy-coolify-application.sh"

export MOCK_CURL_STATE_FILE="${temporary_directory}/reconcile.state"
: >"$MOCK_CURL_STATE_FILE"
if MOCK_CURL_SCENARIO=reconcile bash "${repository_root}/.github/scripts/deploy-coolify-application.sh"; then
  echo 'An unknown deployment state unexpectedly succeeded' >&2
  exit 1
fi
grep --quiet '^cancelled$' "$MOCK_CURL_STATE_FILE"

arithmetic_marker="${temporary_directory}/arithmetic-was-evaluated"
export DEPLOYMENT_TIMEOUT_SECONDS="1+\$(touch ${arithmetic_marker})"
if MOCK_CURL_SCENARIO=success bash "${repository_root}/.github/scripts/deploy-coolify-application.sh"; then
  echo 'An unsafe deployment timeout unexpectedly succeeded' >&2
  exit 1
fi
test ! -e "$arithmetic_marker"
