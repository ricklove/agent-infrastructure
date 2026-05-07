import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const tempDirs: string[] = []
const scriptPath = "/home/ec2-user/workspace/tmp/work-at-health-repo/scripts/work-at.sh"

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "work-at-test-"))
  tempDirs.push(root)
  return root
}

function runWorkAt(
  args: string[],
  options: {
    env?: Record<string, string>
    stdinText?: string
  } = {},
) {
  const env = {
    ...process.env,
    ...options.env,
  }
  let stdin: "ignore" | Blob = "ignore"
  if (options.stdinText != null) {
    const root = createTempRoot()
    const stdinPath = join(root, "stdin.sh")
    writeFileSync(stdinPath, options.stdinText)
    stdin = Bun.file(stdinPath)
  }
  return Bun.spawnSync(["bash", scriptPath, ...args], {
    env,
    stdin,
    stdout: "pipe",
    stderr: "pipe",
  })
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("work-at.sh", () => {
  test("register stores attached health profile", () => {
    const root = createTempRoot()
    const registryPath = join(root, "registry.json")
    const targetPath = join(root, "target")
    mkdirSync(targetPath, { recursive: true })

    const result = runWorkAt(
      [
        "--register",
        "demo",
        "--",
        "--host",
        "local",
        "--path",
        targetPath,
        "--health-profile",
        "demo_profile",
      ],
      {
        env: {
          WORK_AT_REGISTRY_PATH: registryPath,
        },
      },
    )

    expect(result.exitCode).toBe(0)
    const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
      targets: Record<string, { healthProfileId?: string }>
    }
    expect(registry.targets.demo?.healthProfileId).toBe("demo_profile")
  })

  test("health delegates to the configured runner with the target param", () => {
    const root = createTempRoot()
    const registryPath = join(root, "registry.json")
    const targetPath = join(root, "target")
    const runnerPath = join(root, "fake-health-runner.sh")
    const bunPath = join(root, "fake-bun.sh")
    const capturePath = join(root, "capture.txt")
    mkdirSync(targetPath, { recursive: true })

    writeFileSync(
      runnerPath,
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
`,
    )
    writeFileSync(
      bunPath,
      `#!/usr/bin/env bash
set -euo pipefail
runner="$1"
shift
exec "$runner" "$@"
`,
    )
    Bun.spawnSync(["chmod", "+x", runnerPath, bunPath])

    runWorkAt(
      [
        "--register",
        "demo",
        "--",
        "--host",
        "local",
        "--path",
        targetPath,
        "--health-profile",
        "demo_profile",
      ],
      {
        env: {
          WORK_AT_REGISTRY_PATH: registryPath,
        },
      },
    )

    const result = runWorkAt(["--health", "demo", "--json"], {
      env: {
        WORK_AT_REGISTRY_PATH: registryPath,
        WORK_AT_HEALTH_RUNNER_PATH: runnerPath,
        WORK_AT_HEALTH_BUN_BIN: bunPath,
      },
    })

    expect(result.exitCode).toBe(0)
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toEqual([
      "--profile",
      "demo_profile",
      "--param",
      "workTarget=demo",
      "--param",
      `targetPath=${targetPath}`,
      "--json",
    ])
  })

  test("failing command prints health guidance when a profile is attached", () => {
    const root = createTempRoot()
    const registryPath = join(root, "registry.json")
    const targetPath = join(root, "target")
    mkdirSync(targetPath, { recursive: true })

    runWorkAt(
      [
        "--register",
        "demo",
        "--",
        "--host",
        "local",
        "--path",
        targetPath,
        "--health-profile",
        "demo_profile",
      ],
      {
        env: {
          WORK_AT_REGISTRY_PATH: registryPath,
        },
      },
    )

    const result = runWorkAt(["demo", "bash", "-lc", "exit 7"], {
      env: {
        WORK_AT_REGISTRY_PATH: registryPath,
      },
    })

    expect(result.exitCode).toBe(7)
    const stderr = result.stderr.toString("utf8")
    expect(stderr).toContain("work-at: target health profile detected: demo_profile")
    expect(stderr).toContain("work-at --health demo")
    expect(stderr).toContain("future agents stay focused on their primary task")
  })

  test("successful nested-surface command prints guidance to register a narrower target", () => {
    const root = createTempRoot()
    const registryPath = join(root, "registry.json")
    const targetPath = join(root, "target")
    const nestedPath = join(targetPath, "repros", "demo")
    mkdirSync(nestedPath, { recursive: true })

    runWorkAt(
      [
        "--register",
        "demo",
        "--",
        "--host",
        "local",
        "--path",
        targetPath,
        "--health-profile",
        "demo_profile",
      ],
      {
        env: {
          WORK_AT_REGISTRY_PATH: registryPath,
        },
      },
    )

    const result = runWorkAt(
      ["demo", "bash", "-lc", `cd ${nestedPath} && pwd >/dev/null`],
      {
        env: {
          WORK_AT_REGISTRY_PATH: registryPath,
        },
      },
    )

    expect(result.exitCode).toBe(0)
    const stderr = result.stderr.toString("utf8")
    expect(stderr).toContain("narrower surface than target demo")
    expect(stderr).toContain(`nested path: ${nestedPath}`)
    expect(stderr).toContain("suggested command: work-at --register demo-demo")
    expect(stderr).toContain("run: work-at --health demo-demo")
  })

  test("successful nested-surface heredoc prints guidance to register a narrower target", () => {
    const root = createTempRoot()
    const registryPath = join(root, "registry.json")
    const targetPath = join(root, "target")
    const nestedPath = join(targetPath, "repros", "demo")
    mkdirSync(nestedPath, { recursive: true })

    runWorkAt(
      [
        "--register",
        "demo",
        "--",
        "--host",
        "local",
        "--path",
        targetPath,
        "--health-profile",
        "demo_profile",
      ],
      {
        env: {
          WORK_AT_REGISTRY_PATH: registryPath,
        },
      },
    )

    const result = runWorkAt(["demo"], {
      env: {
        WORK_AT_REGISTRY_PATH: registryPath,
      },
      stdinText: `cd ${nestedPath}\npwd >/dev/null\n`,
    })

    expect(result.exitCode).toBe(0)
    const stderr = result.stderr.toString("utf8")
    expect(stderr).toContain("narrower surface than target demo")
    expect(stderr).toContain(`nested path: ${nestedPath}`)
    expect(stderr).toContain("suggested command: work-at --register demo-demo")
  })

  test("absolute nested file paths also trigger narrower-surface guidance", () => {
    const root = createTempRoot()
    const registryPath = join(root, "registry.json")
    const targetPath = join(root, "target")
    const appPath = join(targetPath, "repros", "demo", "apps", "expo-app")
    const filePath = join(appPath, "src", "app.tsx")
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, "export const value = 1\n")

    runWorkAt(
      [
        "--register",
        "demo",
        "--",
        "--host",
        "local",
        "--path",
        targetPath,
        "--health-profile",
        "work_at_target_default",
      ],
      {
        env: {
          WORK_AT_REGISTRY_PATH: registryPath,
        },
      },
    )

    const result = runWorkAt(["demo", "base64", "-w0", filePath], {
      env: {
        WORK_AT_REGISTRY_PATH: registryPath,
      },
    })

    expect(result.exitCode).toBe(0)
    const stderr = result.stderr.toString("utf8")
    expect(stderr).toContain("narrower surface than target demo")
    expect(stderr).toContain(`nested path: ${appPath}`)
    expect(stderr).toContain("suggested command: work-at --register demo-expo-app")
    expect(stderr).toContain("--health-profile work_at_target_default")
  })

  test("nested browser workflow prints targeted health-check guidance", () => {
    const root = createTempRoot()
    const registryPath = join(root, "registry.json")
    const targetPath = join(root, "target")
    const nestedPath = join(targetPath, "repros", "demo")
    mkdirSync(nestedPath, { recursive: true })

    runWorkAt(
      [
        "--register",
        "demo",
        "--",
        "--host",
        "local",
        "--path",
        targetPath,
        "--health-profile",
        "work_at_target_default",
      ],
      {
        env: {
          WORK_AT_REGISTRY_PATH: registryPath,
        },
      },
    )

    const result = runWorkAt(
      [
        "demo",
        "bash",
        "-lc",
        `cd ${nestedPath} && printf '%s\n' "npx agent-browser open http://127.0.0.1:19018/feed-public" "cloudflared tunnel --url http://127.0.0.1:19018" >/dev/null`,
      ],
      {
        env: {
          WORK_AT_REGISTRY_PATH: registryPath,
        },
      },
    )

    expect(result.exitCode).toBe(0)
    const stderr = result.stderr.toString("utf8")
    expect(stderr).toContain("browser/tooling hint")
    expect(stderr).toContain("browser/session hint")
    expect(stderr).toContain("preview/tunnel hint")
    expect(stderr).toContain("suggested health profile for this narrower surface: work_at_expo_preview_surface")
    expect(stderr).toContain("--health-profile work_at_expo_preview_surface")
    expect(stderr).toContain("generic profile work_at_target_default")
  })
})
