#!/usr/bin/env bash
set -euo pipefail

dnf install -y awscli docker git jq unzip

export HOME=/root
export BUN_INSTALL=/opt/bun
if [[ ! -x "$BUN_INSTALL/bin/bun" ]]; then
  curl -fsSL https://bun.sh/install | bash
fi
install -m 0755 "$BUN_INSTALL/bin/bun" /usr/local/bin/bun

systemctl enable docker

mkdir -p /opt/agent-swarm/images
cp Dockerfile /opt/agent-swarm/images/bun-worker.Dockerfile

systemctl start docker
docker build \
  -t agent-swarm/bun-worker-base:latest \
  -f /opt/agent-swarm/images/bun-worker.Dockerfile \
  /opt/agent-swarm/images

bun --version
docker image inspect agent-swarm/bun-worker-base:latest >/dev/null
