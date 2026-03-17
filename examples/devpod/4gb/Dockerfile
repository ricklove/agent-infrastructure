FROM oven/bun:1

WORKDIR /app

COPY package.json tsconfig.json ./
RUN bun install

COPY src ./src

ENV PORT=3000
ENV SERVICE_NAME=devpod-example-4gb
ENV MEMORY_PROFILE_MB=4096

EXPOSE 3000

CMD ["bun", "run", "start"]
