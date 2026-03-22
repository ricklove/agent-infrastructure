#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      exec bash "${ROOT_DIR}/tools/connect-vscode.sh" --help
      ;;
  esac
done

host_alias="$(
  bash "${ROOT_DIR}/tools/connect-vscode.sh" --no-launch --print-host-alias "$@" | tail -n 1
)"

[[ -n "$host_alias" ]] || {
  printf '[connect-ssh] failed to resolve SSH host alias\n' >&2
  exit 1
}

exec ssh "$host_alias"
