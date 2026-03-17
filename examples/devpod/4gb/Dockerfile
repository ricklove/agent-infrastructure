FROM oven/bun:1

WORKDIR /app

COPY package.json tsconfig.json ./
RUN bun install

COPY src ./src

ENV PORT=3000
ENV SERVICE_NAME=devpod-example-4gb
ENV MEMORY_PROFILE_MB=4096
ENV SWARM_NAMESPACE=root
ENV SWARM_SERVICE_NAME=devpod-example-4gb
ENV SWARM_INSTANCE_ID=devpod-example-4gb-local
ENV SWARM_MANAGER_URL=http://127.0.0.1:8787
ENV SWARM_FALLBACK_NAMESPACE=root

EXPOSE 3000

CMD ["bun", "run", "start"]
