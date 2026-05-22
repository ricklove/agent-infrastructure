#!/usr/bin/env bash
set -euo pipefail

WORK_AT_BIN="${WORK_AT_BIN:-work-at}"
ISSUE_DASHBOARD_SESSION_SCRIPT="${ISSUE_DASHBOARD_SESSION_SCRIPT:-/home/ec2-user/workspace/projects/ricklove-agent-infrastructure/scripts/issue-dashboard-session.sh}"
WORK_TARGET=""
DEV_PORT="${DEV_PORT:-5174}"
TTL_SECONDS="${TTL_SECONDS:-900}"
HEALTH_URL_SUFFIX="${HEALTH_URL_SUFFIX:-/content}"
EXPECT_JQ="${EXPECT_JQ:-}"
TUNNEL_LOG="${TUNNEL_LOG:-}"
START_IF_MISSING="${START_IF_MISSING:-0}"
SESSION_PATH="${SESSION_PATH:-/content}"

usage() {
  cat <<'EOF'
Usage:
  issue-dashboard-quick-tunnel-session.sh --work-target <target> [options]

Options:
  --work-target <target>     Registered work-at target for the dashboard app surface
  --dev-port <port>          Local worker dev server port (default: 5174)
  --ttl-seconds <seconds>    Dashboard session TTL (default: 900)
  --health-url-suffix <path> Health endpoint path (default: /content)
  --expect-jq <expr>         jq boolean expression to validate health JSON (default: disabled)
  --session-path <path>      Path used in the issued browser URL (default: /content)
  --start-if-missing         Start a new cloudflared quick tunnel if none can be discovered
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --work-target)
      WORK_TARGET="${2:-}"
      shift 2
      ;;
    --dev-port)
      DEV_PORT="${2:-}"
      shift 2
      ;;
    --ttl-seconds)
      TTL_SECONDS="${2:-}"
      shift 2
      ;;
    --health-url-suffix)
      HEALTH_URL_SUFFIX="${2:-}"
      shift 2
      ;;
    --expect-jq)
      EXPECT_JQ="${2:-}"
      shift 2
      ;;
    --session-path)
      SESSION_PATH="${2:-}"
      shift 2
      ;;
    --start-if-missing)
      START_IF_MISSING="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'issue-dashboard-quick-tunnel-session: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

[[ -n "$WORK_TARGET" ]] || {
  printf 'issue-dashboard-quick-tunnel-session: --work-target is required\n' >&2
  exit 1
}

command -v "$WORK_AT_BIN" >/dev/null 2>&1
command -v jq >/dev/null 2>&1
command -v curl >/dev/null 2>&1
[[ -x "$ISSUE_DASHBOARD_SESSION_SCRIPT" ]] || {
  printf 'issue-dashboard-quick-tunnel-session: session issuer not executable: %s\n' "$ISSUE_DASHBOARD_SESSION_SCRIPT" >&2
  exit 1
}

"$WORK_AT_BIN" --check "$WORK_TARGET" >/dev/null

discover_existing_tunnel_urls() {
  "$WORK_AT_BIN" "$WORK_TARGET" bash -lc '
    set -euo pipefail
    shopt -s nullglob
    count=0
    for f in $(ls -1t /home/ec2-user/state/dashboard/cloudflared-vite*.log 2>/dev/null); do
      count=$((count + 1))
      if [[ "$count" -gt 5 ]]; then
        break
      fi
      url=$(rg -o "https://[a-z0-9-]+\\.trycloudflare\\.com" "$f" | tail -n 1 || true)
      if [[ -n "$url" ]]; then
        printf "%s\n" "$url"
      fi
    done
  ' 2>/dev/null || true
}

ensure_tunnel_started_if_requested() {
  if [[ "$START_IF_MISSING" != "1" ]]; then
    return 0
  fi
  if [[ -z "$TUNNEL_LOG" ]]; then
    TUNNEL_LOG="$("$WORK_AT_BIN" "$WORK_TARGET" bash -lc '
      set -euo pipefail
      mkdir -p /home/ec2-user/state/dashboard
      mktemp /home/ec2-user/state/dashboard/cloudflared-vite.XXXXXX.log
    ')"
  fi
  "$WORK_AT_BIN" "$WORK_TARGET" bash -lc "
    set -euo pipefail
    nohup cloudflared tunnel --url http://127.0.0.1:${DEV_PORT} --no-autoupdate > '$TUNNEL_LOG' 2>&1 &
  "
}

TUNNEL_URLS="$(discover_existing_tunnel_urls)"
if [[ -z "$TUNNEL_URLS" ]]; then
  ensure_tunnel_started_if_requested
  for _ in $(seq 1 30); do
    TUNNEL_URLS="$(discover_existing_tunnel_urls)"
    if [[ -n "$TUNNEL_URLS" ]]; then
      break
    fi
    sleep 1
  done
fi

[[ -n "$TUNNEL_URLS" ]] || {
  printf 'issue-dashboard-quick-tunnel-session: no existing Cloudflare quick tunnel URL found\n' >&2
  exit 1
}

SESSION_JSON="$("$ISSUE_DASHBOARD_SESSION_SCRIPT" --ttl-seconds "$TTL_SECONDS" | rg '^\{\"ok\":' | tail -n 1)"
[[ -n "$SESSION_JSON" ]] || {
  printf 'issue-dashboard-quick-tunnel-session: session issuer returned no JSON payload\n' >&2
  exit 1
}

TOKEN="$(printf '%s' "$SESSION_JSON" | jq -r '.token // empty')"
[[ -n "$TOKEN" ]] || {
  printf 'issue-dashboard-quick-tunnel-session: session issuer did not return a token\n' >&2
  exit 1
}

TUNNEL_URL=""
HEALTH_URL=""
HEALTH_BODY=""
LAST_HEALTH_ERROR=""
for candidate in $TUNNEL_URLS; do
  candidate_health_url="${candidate}${HEALTH_URL_SUFFIX}"
  for _ in $(seq 1 6); do
    if HEALTH_BODY="$(curl -fsS --max-time 5 "$candidate_health_url" 2>/tmp/dashboard-quick-tunnel-health.err)"; then
      if [[ -z "$EXPECT_JQ" ]] || printf '%s' "$HEALTH_BODY" | jq -e "$EXPECT_JQ" >/dev/null 2>&1; then
        TUNNEL_URL="$candidate"
        HEALTH_URL="$candidate_health_url"
        break 2
      fi
    fi
    LAST_HEALTH_ERROR="$(cat /tmp/dashboard-quick-tunnel-health.err 2>/dev/null || true)"
    sleep 1
  done
done
rm -f /tmp/dashboard-quick-tunnel-health.err

[[ -n "$TUNNEL_URL" ]] || {
  printf 'issue-dashboard-quick-tunnel-session: existing quick tunnel health check never passed'
  if [[ -n "$LAST_HEALTH_ERROR" ]]; then
    printf ': %s' "$LAST_HEALTH_ERROR"
  fi
  printf '\n' >&2
  exit 1
}

SESSION_URL="${TUNNEL_URL}${SESSION_PATH}?sessionKey=${TOKEN}"
printf '{"ok":true,"tunnelUrl":"%s","sessionUrl":"%s","healthUrl":"%s"}\n' \
  "$TUNNEL_URL" \
  "$SESSION_URL" \
  "$HEALTH_URL"
