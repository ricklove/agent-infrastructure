FROM oven/bun:1

RUN apt-get update \
  && apt-get install -y --no-install-recommends git openssh-client ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

ENV BUN_INSTALL_CACHE_DIR=/root/.bun/install/cache
