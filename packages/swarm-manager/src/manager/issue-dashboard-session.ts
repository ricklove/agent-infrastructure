import { issueDashboardSession } from "./dashboard-runtime.js";

function parseArgs(argv: string[]): {
  ttlSeconds: number;
  port: number;
  managerUrl: string;
} {
  const args = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, [...(args.get(key) ?? []), "true"]);
      continue;
    }

    args.set(key, [...(args.get(key) ?? []), next]);
    index += 1;
  }

  const ttlSeconds = Number.parseInt(args.get("ttl-seconds")?.[0] ?? "900", 10);
  const port = Number.parseInt(args.get("port")?.[0] ?? "3000", 10);

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("invalid --ttl-seconds");
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("invalid --port");
  }

  return {
    ttlSeconds,
    port,
    managerUrl: args.get("manager-url")?.[0] ?? "http://127.0.0.1:8787",
  };
}

const config = parseArgs(process.argv.slice(2));
try {
  const result = await issueDashboardSession(config);
  console.log(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  console.log(
    JSON.stringify({
      ok: false,
      error:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "dashboard session issuance failed",
    }),
  );
  process.exitCode = 1;
}
