FROM oven/bun:1

WORKDIR /app

COPY package.json tsconfig.json ./
RUN bun install

COPY src ./src

ENV PORT=3000
ENV SERVICE_NAME=devpod-example-2gb
ENV MEMORY_PROFILE_MB=2048

EXPOSE 3000

CMD ["bun", "run", "start"]
