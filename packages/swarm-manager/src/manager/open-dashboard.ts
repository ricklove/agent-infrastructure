import { ensureDashboardRuntime } from "./dashboard-runtime.js"

type OpenDashboardConfig = {
  port: number
  managerUrl: string
  useCloudflared: boolean
}

function parseArgs(argv: string[]): OpenDashboardConfig {
  const args = new Map<string, string[]>()

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token?.startsWith("--")) {
      continue
    }

    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith("--")) {
      args.set(key, [...(args.get(key) ?? []), "true"])
      continue
    }

    args.set(key, [...(args.get(key) ?? []), next])
    index += 1
  }

  const portValue = args.get("port")?.[0] ?? "3000"
  const port = Number.parseInt(portValue, 10)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("invalid --port")
  }

  return {
    port,
    managerUrl: args.get("manager-url")?.[0] ?? "http://127.0.0.1:8787",
    useCloudflared: args.get("cloudflared")?.[0] === "true",
  }
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2))
  const runtime = await ensureDashboardRuntime(config)

  if (!config.useCloudflared || !runtime.publicUrl || !runtime.cloudflaredPid) {
    console.log(JSON.stringify({ ok: true, ...runtime }))
    return
  }

  console.log(
    JSON.stringify({
      ok: true,
      ...runtime,
    }),
  )
}

await main()
