#!/usr/bin/env bash
set -euo pipefail

WORK_TARGET="agent-infra-dev-dashboard-app"
PATH_SUFFIX="/storyboard/debug/storyboardEditor/remote-storyboard/"
PORT="3300"
VERIFY="1"

usage() {
  cat <<'EOF'
Usage:
  scripts/issue-worker-dashboard-session-url.sh [options]

Issue a manager-backed dashboard session key, combine it with the worker quick
tunnel host, verify the composed URL on the worker, and print a fresh unused
dev-worker session URL.

Options:
  --work-target <name>   work-at target to use
  --path <suffix>        route path to append on the worker host
  --port <port>          dashboard gateway port for session issuance
  --no-verify            skip sacrificial verification before printing fresh URL
  --help                 show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --work-target)
      WORK_TARGET="${2:-}"
      shift 2
      ;;
    --path)
      PATH_SUFFIX="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --no-verify)
      VERIFY="0"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PATH_SUFFIX" ]]; then
  echo "--path must not be empty" >&2
  exit 1
fi

if [[ "${PATH_SUFFIX:0:1}" != "/" ]]; then
  PATH_SUFFIX="/$PATH_SUFFIX"
fi

issue_manager_session() {
  local port="$1"
  bash /home/ec2-user/runtime/scripts/issue-dashboard-session.sh --port "$port"
}

extract_token() {
  node -e '
const fs = require("fs")
const input = fs.readFileSync(0, "utf8").trim().split(/\n+/)
for (const line of input) {
  try {
    const payload = JSON.parse(line)
    if (payload && typeof payload.token === "string" && payload.token) {
      process.stdout.write(payload.token)
      process.exit(0)
    }
  } catch {}
}
process.exit(1)
'
}

worker_public_url() {
  work-at "$WORK_TARGET" cat /home/ec2-user/state/dashboard/runtime-state.json | node -e '
const fs = require("fs")
const payload = JSON.parse(fs.readFileSync(0, "utf8"))
if (!payload || typeof payload.publicUrl !== "string" || !payload.publicUrl) {
  process.exit(1)
}
process.stdout.write(payload.publicUrl.replace(/\/+$/, ""))
'
}

verify_url() {
  local url="$1"
  local snapshot
  snapshot="$(
    work-at "$WORK_TARGET" bash -lc \
      "agent-browser open '$url' >/dev/null && agent-browser wait 1500 >/dev/null && agent-browser snapshot -c"
  )"
  case "$snapshot" in
    *'button "Storyboard"'*) ;;
    *)
      echo "verification failed for ${url}" >&2
      exit 1
      ;;
  esac
}

SESSION_OUTPUT="$(issue_manager_session "$PORT")"
SACRIFICIAL_TOKEN="$(printf '%s\n' "$SESSION_OUTPUT" | extract_token)"
PUBLIC_URL="$(worker_public_url)"
SACRIFICIAL_URL="${PUBLIC_URL}${PATH_SUFFIX}?sessionKey=${SACRIFICIAL_TOKEN}"

if [[ "$VERIFY" == "1" ]]; then
  verify_url "$SACRIFICIAL_URL"
fi

FRESH_OUTPUT="$(issue_manager_session "$PORT")"
FRESH_TOKEN="$(printf '%s\n' "$FRESH_OUTPUT" | extract_token)"
FRESH_URL="${PUBLIC_URL}${PATH_SUFFIX}?sessionKey=${FRESH_TOKEN}"

cat <<EOF
workerQuickTunnelHost=${PUBLIC_URL}
sessionKeyAuthority=manager-issued
reminder=Use the manager-issued sessionKey with the worker quick-tunnel host, not the publicUrl returned by issue-dashboard-session.sh.
freshStoryboardUrl=${FRESH_URL}
EOF
