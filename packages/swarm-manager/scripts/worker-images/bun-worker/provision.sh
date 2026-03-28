#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="/home/ec2-user/workspace"

dnf install -y awscli docker git jq unzip

cat > /etc/profile.d/agent-browser-idle-timeout.sh <<'EOF'
export AGENT_BROWSER_IDLE_TIMEOUT_MS="${AGENT_BROWSER_IDLE_TIMEOUT_MS:-300000}"
EOF
chmod 0644 /etc/profile.d/agent-browser-idle-timeout.sh
if grep -q '^AGENT_BROWSER_IDLE_TIMEOUT_MS=' /etc/environment; then
  sed -i 's/^AGENT_BROWSER_IDLE_TIMEOUT_MS=.*/AGENT_BROWSER_IDLE_TIMEOUT_MS=300000/' /etc/environment
else
  printf '\nAGENT_BROWSER_IDLE_TIMEOUT_MS=300000\n' >> /etc/environment
fi

export HOME=/root
export BUN_INSTALL=/opt/bun
if [[ ! -x "$BUN_INSTALL/bin/bun" ]]; then
  curl -fsSL https://bun.sh/install | bash
fi
install -m 0755 "$BUN_INSTALL/bin/bun" /usr/local/bin/bun

systemctl enable docker

mkdir -p "${WORKSPACE_ROOT}/images"
cp Dockerfile "${WORKSPACE_ROOT}/images/bun-worker.Dockerfile"
mkdir -p "${WORKSPACE_ROOT}/images/bun-repo-runner"
cp repo-runner/Dockerfile "${WORKSPACE_ROOT}/images/bun-repo-runner/Dockerfile"
cp repo-runner/start.sh "${WORKSPACE_ROOT}/images/bun-repo-runner/start.sh"
chmod +x "${WORKSPACE_ROOT}/images/bun-repo-runner/start.sh"

systemctl start docker
docker build \
  -t agent-swarm/bun-worker-base:latest \
  -f "${WORKSPACE_ROOT}/images/bun-worker.Dockerfile" \
  "${WORKSPACE_ROOT}/images"
docker build \
  -t agent-swarm/bun-repo-runner:latest \
  -f "${WORKSPACE_ROOT}/images/bun-repo-runner/Dockerfile" \
  "${WORKSPACE_ROOT}/images/bun-repo-runner"

bun --version
docker image inspect agent-swarm/bun-worker-base:latest >/dev/null
docker image inspect agent-swarm/bun-repo-runner:latest >/dev/null

mkdir -p /home/ec2-user/state
cat > /home/ec2-user/state/worker-image-profile.json <<'PROFILE'
{
  "profile": "bun-worker",
  "preinstalledPackages": ["aws", "docker", "jq", "unzip", "git"],
  "bunInstalled": true,
  "envDefaults": {
    "AGENT_BROWSER_IDLE_TIMEOUT_MS": "300000"
  },
  "dockerImages": [
    "agent-swarm/bun-worker-base:latest",
    "agent-swarm/bun-repo-runner:latest"
  ]
}
PROFILE
chown -R ec2-user:ec2-user /home/ec2-user/state
