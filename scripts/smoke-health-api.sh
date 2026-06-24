#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${DASHBOARD_HEALTH_API_BASE_URL:-http://127.0.0.1:3300}"
PROFILE_ID="${DASHBOARD_HEALTH_PROFILE_ID:-work_at_dashboard_app_live_dev_surface}"
TARGET_ID="${DASHBOARD_HEALTH_TARGET_ID:-local}"
REPO_ROOT="${DASHBOARD_HEALTH_REPO_ROOT:-$(pwd)}"

curl -fsS "${BASE_URL}/api/health/profiles" | jq '{ok, profileIds: [.profiles[].id]}'
curl -fsS "${BASE_URL}/api/health/profiles/${PROFILE_ID}" | jq '{ok, id: .profile.id, checks: (.profile.checks | length)}'
curl -fsS -X POST "${BASE_URL}/api/health/run" \
  -H 'content-type: application/json' \
  --data "$(jq -nc \
    --arg profileId "$PROFILE_ID" \
    --arg targetId "$TARGET_ID" \
    --arg appPath "${REPO_ROOT}/apps/dashboard-app" \
    --arg localDevUrl "http://127.0.0.1:5173/storyboard/debug/" \
    --arg liveDevUrl "http://127.0.0.1:5173/storyboard/debug/" \
    '{profileId:$profileId,targetId:$targetId,params:{appPath:$appPath,localDevUrl:$localDevUrl,liveDevUrl:$liveDevUrl,liveDevMustContain:"@vite/client"}}')" \
  | jq '{ok, runId: .result.runId, status: .result.status, checks: [.result.checks[] | {id,status,severity,failureClass:(.failure.class // null)}]}'
curl -fsS "${BASE_URL}/api/health/latest?profileId=${PROFILE_ID}" | jq '{ok, runId: .result.runId, status: .result.status, storedChecks: (.result.checks | length)}'
