import { runDashboardRecoveryMonitor } from "./dashboard-runtime.js";

function parseArgs(argv: string[]): {
  port: number;
  managerUrl: string;
  publicUrl: string;
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

  const port = Number.parseInt(args.get("port")?.[0] ?? "3000", 10);
  const managerUrl = args.get("manager-url")?.[0] ?? "http://127.0.0.1:8787";
  const publicUrl = args.get("public-url")?.[0] ?? "";

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("invalid --port");
  }

  if (!publicUrl.trim()) {
    throw new Error("invalid --public-url");
  }

  return {
    port,
    managerUrl,
    publicUrl,
  };
}

await runDashboardRecoveryMonitor(parseArgs(process.argv.slice(2)));
