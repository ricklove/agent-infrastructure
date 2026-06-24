#!/usr/bin/env bash
set -euo pipefail

# Guarded lifecycle helper for the ddev Storyboard worker dashboard surface.
# Default operations preserve the existing cloudflared quicktunnel and only
# restart/update the dashboard gateway or Vite process behind it.

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)}"
STATE_DIR="${DASHBOARD_STATE_DIR:-/home/ec2-user/state/dashboard}"
LOG_DIR="${DASHBOARD_LOG_DIR:-/home/ec2-user/state/logs}"
RUNTIME_STATE_PATH="${DASHBOARD_RUNTIME_STATE_PATH:-${STATE_DIR}/runtime-state.json}"
GATEWAY_PORT="${DASHBOARD_GATEWAY_PORT:-3300}"
VITE_PORT="${DASHBOARD_VITE_PORT:-5173}"
EXPECTED_PUBLIC_URL="${DASHBOARD_PUBLIC_URL:-https://ecommerce-followed-sandwich-heroes.trycloudflare.com}"
HEALTH_PATH="${DASHBOARD_HEALTH_PATH:-/health?profileId=work_at_dashboard_app_live_dev_surface}"
CLOUDFLARED_LOG="${DASHBOARD_CLOUDFLARED_LOG:-${LOG_DIR}/ddev-storyboard-cloudflared-${GATEWAY_PORT}.log}"
GATEWAY_LOG="${DASHBOARD_GATEWAY_LOG:-${STATE_DIR}/dashboard.log}"
VITE_LOG="${DASHBOARD_VITE_LOG:-${STATE_DIR}/dashboard-app-vite.log}"

usage() {
  cat <<EOF
usage: $(basename "$0") <status|restart-app|restart-gateway|restart-vite|ensure-tunnel>

Persistent quicktunnel contract:
  - status/restart-app/restart-gateway/restart-vite never restart cloudflared.
  - ensure-tunnel reuses the existing runtime-state publicUrl/process when live.
  - ensure-tunnel starts cloudflared only when no live tunnel process+public URL exists.
  - code updates should run restart-app, not recreate the tunnel.

Environment overrides:
  DASHBOARD_PUBLIC_URL=${EXPECTED_PUBLIC_URL}
  DASHBOARD_GATEWAY_PORT=${GATEWAY_PORT}
  DASHBOARD_VITE_PORT=${VITE_PORT}
  DASHBOARD_RUNTIME_STATE_PATH=${RUNTIME_STATE_PATH}
EOF
}

pid_for_port() {
  local port="$1"
  ss -ltnp 2>/dev/null \
    | awk -v p=":${port}" '$4 ~ p {print $0}' \
    | sed -nE 's/.*pid=([0-9]+).*/\1/p' \
    | head -n 1
}

state_value() {
  local key="$1"
  python3 - "$RUNTIME_STATE_PATH" "$key" <<'PY'
import json, pathlib, sys
p=pathlib.Path(sys.argv[1])
if not p.exists():
    print("")
    raise SystemExit(0)
try:
    value=json.loads(p.read_text()).get(sys.argv[2], "")
except Exception:
    value=""
print(value if value is not None else "")
PY
}

pid_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

probe_url() {
  local url="$1"
  curl -fsS --max-time 8 "$url" >/dev/null
}

current_cloudflared_pid() {
  local state_pid
  state_pid="$(state_value cloudflaredPid)"
  if pid_alive "$state_pid" && ps -p "$state_pid" -o args= | grep -q "127.0.0.1:${GATEWAY_PORT}"; then
    printf '%s\n' "$state_pid"
    return 0
  fi
  pgrep -af "cloudflared tunnel --url http://127.0.0.1:${GATEWAY_PORT}" \
    | awk '{print $1}' \
    | head -n 1
}

write_runtime_state() {
  local public_url="$1"
  local cloudflared_pid="$2"
  local gateway_pid="$3"
  mkdir -p "$STATE_DIR" "$LOG_DIR"
  python3 - "$RUNTIME_STATE_PATH" "$public_url" "$cloudflared_pid" "$gateway_pid" "$GATEWAY_PORT" "$CLOUDFLARED_LOG" "$GATEWAY_LOG" <<'PY'
import json, pathlib, sys, time
path=pathlib.Path(sys.argv[1])
try:
    state=json.loads(path.read_text()) if path.exists() else {}
except Exception:
    state={}
public_url, tunnel_pid, gateway_pid, port, tunnel_log, gateway_log = sys.argv[2:]
now=int(time.time()*1000)
state.update({
    "publicUrl": public_url.rstrip('/'),
    "localUrl": f"http://127.0.0.1:{port}",
    "cloudflaredMode": "quick",
    "cloudflaredPid": int(tunnel_pid) if tunnel_pid.isdigit() else None,
    "tunnelPid": int(tunnel_pid) if tunnel_pid.isdigit() else None,
    "tunnelProvider": "cloudflared",
    "cloudflaredLogPath": tunnel_log,
    "tunnelLogPath": tunnel_log,
    "dashboardPid": int(gateway_pid) if gateway_pid.isdigit() else None,
    "dashboardLogPath": gateway_log,
    "updatedAtMs": now,
})
state.setdefault("tunnelCreatedAtMs", now)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")
PY
}

status() {
  local public_url cloudflared_pid gateway_pid vite_pid
  public_url="$(state_value publicUrl)"
  cloudflared_pid="$(current_cloudflared_pid || true)"
  gateway_pid="$(pid_for_port "$GATEWAY_PORT" || true)"
  vite_pid="$(pid_for_port "$VITE_PORT" || true)"
  printf 'runtime_state=%s\n' "$RUNTIME_STATE_PATH"
  printf 'expected_public_url=%s\n' "$EXPECTED_PUBLIC_URL"
  printf 'state_public_url=%s\n' "$public_url"
  printf 'cloudflared_pid=%s\n' "${cloudflared_pid:-}"
  printf 'gateway_pid=%s\n' "${gateway_pid:-}"
  printf 'vite_pid=%s\n' "${vite_pid:-}"
  if [[ -n "$cloudflared_pid" ]] && pid_alive "$cloudflared_pid"; then
    printf 'cloudflared_status=alive\n'
  else
    printf 'cloudflared_status=missing\n'
  fi
  if probe_url "http://127.0.0.1:${GATEWAY_PORT}${HEALTH_PATH}"; then
    printf 'local_gateway_health=pass\n'
  else
    printf 'local_gateway_health=fail\n'
  fi
  if [[ -n "$public_url" ]] && probe_url "${public_url%/}${HEALTH_PATH}"; then
    printf 'public_health=pass\n'
  else
    printf 'public_health=fail\n'
  fi
}

kill_port_listener() {
  local port="$1"
  local pid
  pid="$(pid_for_port "$port" || true)"
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
    for _ in {1..20}; do
      sleep 0.25
      pid_for_port "$port" >/dev/null || return 0
    done
    kill -9 "$pid" 2>/dev/null || true
  fi
}

restart_vite() {
  # The Bun gateway owns the managed Vite process. Do not start a second
  # standalone Vite from this helper; that can race the gateway and make Vite
  # choose a fallback port. Kill the 5173 listener, then ask the gateway route
  # to spawn the managed frontend behind the persistent tunnel.
  kill_port_listener "$VITE_PORT"
  for _ in {1..80}; do
    probe_url "http://127.0.0.1:${GATEWAY_PORT}${HEALTH_PATH}" >/dev/null 2>&1 || true
    if probe_url "http://127.0.0.1:${VITE_PORT}/"; then
      printf 'vite_restarted=1\n'
      return 0
    fi
    sleep 0.25
  done
  printf 'vite_restarted=0 log=%s\n' "$VITE_LOG" >&2
  return 1
}

restart_gateway() {
  mkdir -p "$STATE_DIR"
  kill_port_listener "$GATEWAY_PORT"
  (
    cd "$REPO_ROOT/packages/dashboard"
    nohup env DASHBOARD_PORT="$GATEWAY_PORT" DASHBOARD_DEV_FRONTEND=1 DASHBOARD_REPO_ROOT="$REPO_ROOT" bun run src/server.ts >>"$GATEWAY_LOG" 2>&1 &
  )
  for _ in {1..80}; do
    if probe_url "http://127.0.0.1:${GATEWAY_PORT}${HEALTH_PATH}"; then
      local gateway_pid cloudflared_pid public_url
      gateway_pid="$(pid_for_port "$GATEWAY_PORT" || true)"
      cloudflared_pid="$(current_cloudflared_pid || true)"
      public_url="$(state_value publicUrl)"
      [[ -n "$public_url" ]] || public_url="$EXPECTED_PUBLIC_URL"
      write_runtime_state "$public_url" "$cloudflared_pid" "$gateway_pid"
      printf 'gateway_restarted=1\n'
      return 0
    fi
    sleep 0.25
  done
  printf 'gateway_restarted=0 log=%s\n' "$GATEWAY_LOG" >&2
  return 1
}

ensure_tunnel() {
  mkdir -p "$LOG_DIR" "$STATE_DIR"
  local public_url cloudflared_pid gateway_pid
  public_url="$(state_value publicUrl)"
  cloudflared_pid="$(current_cloudflared_pid || true)"
  if [[ -n "$public_url" ]] && [[ -n "$cloudflared_pid" ]] && pid_alive "$cloudflared_pid" && probe_url "${public_url%/}${HEALTH_PATH}"; then
    printf 'quicktunnel_reused=1 public_url=%s pid=%s\n' "$public_url" "$cloudflared_pid"
    return 0
  fi
  if ! probe_url "http://127.0.0.1:${GATEWAY_PORT}${HEALTH_PATH}"; then
    printf 'cannot_start_tunnel=local_gateway_unhealthy\n' >&2
    return 1
  fi
  printf 'quicktunnel_reused=0 reason=no_live_tunnel_starting_cloudflared\n' >&2
  nohup cloudflared tunnel --url "http://127.0.0.1:${GATEWAY_PORT}" --http-host-header "127.0.0.1:${GATEWAY_PORT}" --no-autoupdate >>"$CLOUDFLARED_LOG" 2>&1 &
  cloudflared_pid="$!"
  for _ in {1..120}; do
    public_url="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" | tail -n 1 || true)"
    if [[ -n "$public_url" ]] && probe_url "${public_url%/}${HEALTH_PATH}"; then
      gateway_pid="$(pid_for_port "$GATEWAY_PORT" || true)"
      write_runtime_state "$public_url" "$cloudflared_pid" "$gateway_pid"
      printf 'quicktunnel_started=1 public_url=%s pid=%s\n' "$public_url" "$cloudflared_pid"
      return 0
    fi
    sleep 0.5
  done
  printf 'quicktunnel_started=0 log=%s\n' "$CLOUDFLARED_LOG" >&2
  return 1
}

case "${1:-}" in
  status) status ;;
  restart-vite) restart_vite ;;
  restart-gateway) restart_gateway ;;
  restart-app) restart_vite && restart_gateway && status ;;
  ensure-tunnel) ensure_tunnel ;;
  -h|--help|help|"") usage ;;
  *) usage >&2; exit 2 ;;
esac
