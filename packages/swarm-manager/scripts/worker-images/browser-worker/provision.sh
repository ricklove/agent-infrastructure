#!/usr/bin/env bash
set -euo pipefail

dnf install -y awscli git jq unzip

export HOME=/root
export BUN_INSTALL=/opt/bun
if [[ ! -x "$BUN_INSTALL/bin/bun" ]]; then
  curl -fsSL https://bun.sh/install | bash
fi
install -m 0755 "$BUN_INSTALL/bin/bun" /usr/local/bin/bun

mkdir -p /home/ec2-user/workspace/browser-runtime
cd /home/ec2-user/workspace/browser-runtime

cat > package.json <<'EOF'
{
  "name": "agent-swarm-browser-runtime",
  "private": true,
  "dependencies": {
    "playwright": "^1.54.2"
  }
}
EOF

bun install
bun x playwright install --with-deps chromium
