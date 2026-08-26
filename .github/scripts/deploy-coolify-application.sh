#!/usr/bin/env bash

set -euo pipefail
umask 077

required_variables=(
  COOLIFY_DEPLOY_URL
  COOLIFY_TOKEN
  CF_ACCESS_CLIENT_ID
  CF_ACCESS_CLIENT_SECRET
  EXPECTED_COMMIT
  EXPECTED_IMAGE_DIGEST
  EXPECTED_COMPOSE_LOCATION
  PRODUCTION_BASE_URL
)
for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Required deployment variable is missing: ${variable_name}" >&2
    exit 1
  fi
done

if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'EXPECTED_COMMIT must be a full Git commit SHA' >&2
  exit 1
fi
if [[ ! "$EXPECTED_IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo 'EXPECTED_IMAGE_DIGEST must be an exact sha256 digest' >&2
  exit 1
fi
if [[ "$COOLIFY_DEPLOY_URL" != https://*/api/v1/deploy\?* ]]; then
  echo 'COOLIFY_DEPLOY_URL must be an HTTPS Coolify API deployment URL' >&2
  exit 1
fi
if [[ ! "$PRODUCTION_BASE_URL" =~ ^https://[^[:space:]?#]+(/[^[:space:]?#]*)?$ ]]; then
  echo 'PRODUCTION_BASE_URL must be an HTTPS origin or base path without a query or fragment' >&2
  exit 1
fi

validate_bounded_integer() {
  local name="$1"
  local value="$2"
  local minimum="$3"
  local maximum="$4"
  if [[ ! "$value" =~ ^[1-9][0-9]{0,4}$ ]] || \
    ((10#$value < minimum || 10#$value > maximum)); then
    echo "${name} must be a decimal integer between ${minimum} and ${maximum}" >&2
    exit 1
  fi
}

deployment_timeout_seconds="${DEPLOYMENT_TIMEOUT_SECONDS:-1200}"
deployment_poll_seconds="${DEPLOYMENT_POLL_SECONDS:-5}"
readiness_timeout_seconds="${READINESS_TIMEOUT_SECONDS:-300}"
reconciliation_timeout_seconds="${RECONCILIATION_TIMEOUT_SECONDS:-120}"
validate_bounded_integer DEPLOYMENT_TIMEOUT_SECONDS "$deployment_timeout_seconds" 60 3600
validate_bounded_integer DEPLOYMENT_POLL_SECONDS "$deployment_poll_seconds" 1 60
validate_bounded_integer READINESS_TIMEOUT_SECONDS "$readiness_timeout_seconds" 30 900
validate_bounded_integer RECONCILIATION_TIMEOUT_SECONDS "$reconciliation_timeout_seconds" 30 300

coolify_api_url="${COOLIFY_DEPLOY_URL%%/deploy\?*}"
deploy_query="${COOLIFY_DEPLOY_URL#*\?}"
application_uuid=''
IFS='&' read -r -a query_parameters <<<"$deploy_query"
for query_parameter in "${query_parameters[@]}"; do
  if [[ "${query_parameter%%=*}" == 'uuid' ]]; then
    application_uuid="${query_parameter#*=}"
    break
  fi
done
if [[ ! "$application_uuid" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo 'COOLIFY_DEPLOY_URL must contain one valid application UUID' >&2
  exit 1
fi

temporary_directory=$(mktemp -d)
deployment_uuid=''
application_id=''
deployment_request_attempted=false
release_verified=false

request() {
  local method="$1"
  local endpoint="$2"
  local destination="$3"
  local payload="${4:-}"
  local response_code
  local curl_arguments=(
    --request "$method"
    --url "${coolify_api_url}${endpoint}"
    --header "Authorization: Bearer ${COOLIFY_TOKEN}"
    --header "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}"
    --header "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"
    --header 'Accept: application/json'
    --output "$destination"
    --write-out '%{http_code}'
    --connect-timeout 15
    --max-time 60
    --fail-with-body
    --silent
    --show-error
  )
  if [[ -n "$payload" ]]; then
    curl_arguments+=(--header 'Content-Type: application/json' --data "$payload")
  fi

  if ! response_code=$(curl "${curl_arguments[@]}"); then
    echo 'Coolify API request failed' >&2
    return 1
  fi
  if [[ ! "$response_code" =~ ^2[0-9][0-9]$ ]]; then
    echo 'Coolify API request returned a non-success response' >&2
    return 1
  fi
}

assert_application_configuration() {
  local application_file="$1"
  jq --exit-status \
    --arg uuid "$application_uuid" \
    --arg compose_location "$EXPECTED_COMPOSE_LOCATION" '
      def normalized_location:
        sub("^\\./"; "") | sub("^/"; "");
      .uuid == $uuid and
      .build_pack == "dockercompose" and
      ((.docker_compose_location // "") | normalized_location) == ($compose_location | normalized_location) and
      .settings.is_raw_compose_deployment_enabled == true and
      .settings.is_auto_deploy_enabled == false
    ' "$application_file" >/dev/null
}

verify_public_release_once() {
  local health_file="${temporary_directory}/health.json"
  local version_file="${temporary_directory}/version.json"
  local database_read_file="${temporary_directory}/database-read.json"
  local base_url="${PRODUCTION_BASE_URL%/}"

  curl --fail --silent --max-time 15 --output "$health_file" "${base_url}/health" &&
    curl --fail --silent --max-time 30 --output "$version_file" "${base_url}/version" &&
    curl --fail --silent --max-time 30 --output "$database_read_file" "${base_url}/api/v1/tags" &&
    jq --exit-status '.status == "ok"' "$health_file" >/dev/null &&
    jq --exit-status \
      --arg commit "$EXPECTED_COMMIT" \
      --arg digest "$EXPECTED_IMAGE_DIGEST" \
      '.commit == $commit and .imageDigest == $digest' \
      "$version_file" >/dev/null &&
    jq --exit-status '
      (.tags | type == "array") and
      (.tagGroups | type == "array") and
      (.tagSongs | type == "array")
    ' "$database_read_file" >/dev/null
}

wait_for_public_release() {
  local deadline=$((SECONDS + 10#$readiness_timeout_seconds))
  while ((SECONDS < deadline)); do
    if verify_public_release_once; then
      return 0
    fi
    sleep "$deployment_poll_seconds"
  done
  return 1
}

reconcile_deployment() {
  local deployment_file="${temporary_directory}/reconcile-deployment.json"
  local cancellation_file="${temporary_directory}/cancel-deployment.json"
  local cancellation_requested=false
  local deadline=$((SECONDS + 10#$reconciliation_timeout_seconds))
  local status=''

  echo "Reconciling unfinished Coolify deployment ${deployment_uuid}" >&2
  while ((SECONDS < deadline)); do
    if ! request GET "/deployments/${deployment_uuid}" "$deployment_file"; then
      sleep "$deployment_poll_seconds"
      continue
    fi
    status=$(jq --raw-output '.status // empty' "$deployment_file" 2>/dev/null || true)
    case "$status" in
      finished)
        if verify_public_release_once; then
          echo "Coolify deployment ${deployment_uuid} finished with the expected healthy release" >&2
          return 0
        fi
        sleep "$deployment_poll_seconds"
        ;;
      failed | cancelled | cancelled-by-user | cancelled_by_user)
        echo "Coolify deployment ${deployment_uuid} reached terminal status: ${status}" >&2
        return 0
        ;;
      *)
        if [[ "$cancellation_requested" != 'true' ]]; then
          # A current Coolify version may report an error after persisting the
          # cancellation, so always poll the deployment to prove terminal state.
          request POST "/deployments/${deployment_uuid}/cancel" "$cancellation_file" || true
          cancellation_requested=true
        fi
        sleep "$deployment_poll_seconds"
        ;;
    esac
  done

  echo "Coolify deployment ${deployment_uuid} did not reach a verified terminal state; reconcile it before another release" >&2
  return 1
}

discover_attempted_deployment() {
  local deploy_file="${temporary_directory}/deploy.json"
  local deployments_file="${temporary_directory}/active-deployments.json"
  local discovered=''

  if [[ -s "$deploy_file" ]]; then
    discovered=$(jq --raw-output --arg uuid "$application_uuid" '
      [.deployments[]? | select(.resource_uuid == $uuid)] |
      if length == 1 then .[0].deployment_uuid else empty end
    ' "$deploy_file" 2>/dev/null || true)
  fi
  if [[ ! "$discovered" =~ ^[A-Za-z0-9_-]+$ ]] && [[ -n "$application_id" ]]; then
    if request GET '/deployments' "$deployments_file"; then
      discovered=$(jq --raw-output --arg application_id "$application_id" '
        [.[] | select((.application_id | tostring) == $application_id)] |
        if length == 1 then .[0].deployment_uuid else empty end
      ' "$deployments_file" 2>/dev/null || true)
    fi
  fi
  if [[ "$discovered" =~ ^[A-Za-z0-9_-]+$ ]]; then
    deployment_uuid="$discovered"
    return 0
  fi
  return 1
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  set +e
  if [[ "$deployment_request_attempted" == 'true' && -z "$deployment_uuid" ]]; then
    discover_attempted_deployment || echo \
      "Could not identify the attempted Coolify deployment for application ${application_uuid}; inspect it before another release" >&2
  fi
  if [[ -n "$deployment_uuid" && "$release_verified" != 'true' ]]; then
    reconcile_deployment || echo \
      "Manual recovery required for Coolify deployment ${deployment_uuid}; do not promote or start another release" >&2
  fi
  rm -rf -- "$temporary_directory"
  exit "$exit_code"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

application_file="${temporary_directory}/application.json"
request GET "/applications/${application_uuid}" "$application_file"
if ! assert_application_configuration "$application_file"; then
  echo 'Coolify application must use the reviewed Compose file, Raw Compose, and disabled native auto-deploy' >&2
  exit 1
fi
application_id=$(jq --exit-status --raw-output '.id | tostring' "$application_file")
if [[ ! "$application_id" =~ ^[1-9][0-9]*$ ]]; then
  echo 'Coolify application did not report one valid numeric identifier' >&2
  exit 1
fi

image_payload=$(jq --null-input --compact-output \
  --arg value "$EXPECTED_IMAGE_DIGEST" \
  '{
    key: "BACKEND_IMAGE_DIGEST",
    value: $value,
    is_preview: false,
    is_literal: true,
    is_runtime: true,
    is_buildtime: true
  }')
image_response_file="${temporary_directory}/image-environment.json"
environment_file="${temporary_directory}/environments.json"
request GET "/applications/${application_uuid}/envs" "$environment_file"
image_variable_count=$(jq --exit-status \
  '[.[] | select(.key == "BACKEND_IMAGE_DIGEST" and .is_preview == false)] | length' \
  "$environment_file")
case "$image_variable_count" in
  0)
    request POST "/applications/${application_uuid}/envs" "$image_response_file" "$image_payload"
    ;;
  1)
    request PATCH "/applications/${application_uuid}/envs" "$image_response_file" "$image_payload"
    ;;
  *)
    echo 'Coolify has duplicate runtime BACKEND_IMAGE_DIGEST variables' >&2
    exit 1
    ;;
esac

request GET "/applications/${application_uuid}/envs" "$environment_file"
if ! jq --exit-status \
  '
    [.[] | select(
      .key == "BACKEND_IMAGE_DIGEST" and
      .is_preview == false and
      .is_runtime == true and
      .is_buildtime == true
    )] | length == 1
  ' "$environment_file" >/dev/null; then
  echo 'Coolify did not retain one build-and-runtime BACKEND_IMAGE_DIGEST variable' >&2
  exit 1
fi

commit_payload=$(jq --null-input --compact-output --arg commit "$EXPECTED_COMMIT" '{git_commit_sha: $commit}')
request PATCH "/applications/${application_uuid}" "$application_file" "$commit_payload"
request GET "/applications/${application_uuid}" "$application_file"
if ! assert_application_configuration "$application_file" || \
  ! jq --exit-status --arg commit "$EXPECTED_COMMIT" '.git_commit_sha == $commit' "$application_file" >/dev/null; then
  echo 'Coolify did not retain the exact source commit or safe application configuration' >&2
  exit 1
fi

deploy_file="${temporary_directory}/deploy.json"
active_deployments_file="${temporary_directory}/active-deployments.json"
request GET '/deployments' "$active_deployments_file"
if jq --exit-status --arg application_id "$application_id" '
  any(.[]; (.application_id | tostring) == $application_id)
' "$active_deployments_file" >/dev/null; then
  echo 'Coolify already has an active deployment for this application' >&2
  exit 1
fi

deployment_request_attempted=true
request POST "/deploy?uuid=${application_uuid}" "$deploy_file"
discover_attempted_deployment || true
if [[ ! "$deployment_uuid" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo 'Coolify did not return one valid deployment UUID' >&2
  exit 1
fi

deployment_file="${temporary_directory}/deployment.json"
deadline=$((SECONDS + 10#$deployment_timeout_seconds))
last_status=''
while ((SECONDS < deadline)); do
  request GET "/deployments/${deployment_uuid}" "$deployment_file"
  status=$(jq --exit-status --raw-output '.status' "$deployment_file")
  queued_commit=$(jq --raw-output '.commit // empty' "$deployment_file")
  if [[ -n "$queued_commit" && "$queued_commit" != "$EXPECTED_COMMIT" ]]; then
    echo 'Coolify queued a deployment for an unexpected source commit' >&2
    exit 1
  fi
  if [[ "$status" != "$last_status" ]]; then
    echo "Coolify deployment status: ${status}"
    last_status="$status"
  fi

  case "$status" in
    finished)
      if [[ "$queued_commit" != "$EXPECTED_COMMIT" ]]; then
        echo 'Finished Coolify deployment did not report the expected source commit' >&2
        exit 1
      fi
      break
      ;;
    queued | in_progress)
      sleep "$deployment_poll_seconds"
      ;;
    failed | cancelled | cancelled-by-user | cancelled_by_user)
      echo "Coolify deployment ended with status: ${status}" >&2
      exit 1
      ;;
    *)
      echo "Coolify returned an unrecognized deployment status: ${status}" >&2
      exit 1
      ;;
  esac
done

if [[ "$status" != 'finished' ]]; then
  echo 'Timed out waiting for the Coolify deployment' >&2
  exit 1
fi

if ! wait_for_public_release; then
  echo 'The deployed backend did not become healthy with the expected source, image digest, and database read' >&2
  exit 1
fi

release_verified=true
echo "Coolify deployment ${deployment_uuid} is finished and the release identity is verified"
