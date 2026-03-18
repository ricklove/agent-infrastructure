FROM agent-swarm/bun-worker-base:latest

RUN mkdir -p /opt/agent-swarm \
  && git clone https://github.com/ricklove/agent-infrastructure.git /opt/agent-swarm/agent-infrastructure

WORKDIR /opt/agent-swarm/agent-infrastructure

COPY start.sh /usr/local/bin/agent-swarm-bun-repo-runner-start
RUN chmod +x /usr/local/bin/agent-swarm-bun-repo-runner-start

ENV RUNNER_REPO_DIR=/opt/agent-swarm/agent-infrastructure
ENV RUNNER_REPO_URL=https://github.com/ricklove/agent-infrastructure.git
ENV RUNNER_REPO_REF=development
ENV RUNNER_APP_DIR=examples/benchmarks/bun-repo-runner
ENV PORT=3000

EXPOSE 3000

CMD ["/usr/local/bin/agent-swarm-bun-repo-runner-start"]
