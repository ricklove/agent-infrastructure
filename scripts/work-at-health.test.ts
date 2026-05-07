import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { runWorkspaceHealthProfile } from "./work-at-health"

const tempDirs: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "workspace-health-"))
  tempDirs.push(root)
  return root
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("runWorkspaceHealthProfile", () => {
  test("runs local checks from the configured profile", () => {
    const root = createTempRoot()
    const healthRoot = join(root, "workspace", "health")
    const passFile = join(root, "ok.txt")
    writeFileSync(passFile, "ok\n")

    writeJson(join(healthRoot, "checks", "path-exists.health-check.json"), {
      id: "path_exists",
      title: "Required path exists",
      description: "Path exists.",
      execution: { kind: "local" },
      command: ["bash", "-lc", "test -e {{path}}"],
      timeoutMs: 5000,
    })
    writeJson(join(healthRoot, "profiles", "test.health-profile.json"), {
      id: "test_profile",
      title: "Test Profile",
      description: "Runs one local file check.",
      checks: [
        {
          id: "pass_file_exists",
          checkId: "path_exists",
          title: "Pass file exists",
          severity: "blocking",
          params: {
            path: passFile,
          },
        },
      ],
    })

    const report = runWorkspaceHealthProfile({
      profileId: "test_profile",
      workspaceHealthRoot: healthRoot,
    })

    expect(report.status).toBe("healthy")
    expect(report.failureCount).toBe(0)
    expect(report.findings[0]?.status).toBe("healthy")
  })

  test("wraps work-at checks with the configured work-at binary", () => {
    const root = createTempRoot()
    const healthRoot = join(root, "workspace", "health")
    const capturePath = join(root, "captured-args.txt")
    const fakeWorkAtPath = join(root, "fake-work-at.sh")

    writeFileSync(
      fakeWorkAtPath,
      `#!/usr/bin/env bash
set -euo pipefail
printf 'SUPPRESS=%s\\n' "\${WORK_AT_SUPPRESS_GUIDANCE:-}" > ${JSON.stringify(join(root, "captured-env.txt"))}
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
shift
"$@"
`,
    )
    chmodSync(fakeWorkAtPath, 0o755)

    writeJson(join(healthRoot, "checks", "work-at.health-check.json"), {
      id: "remote_echo",
      title: "Remote echo runs",
      description: "Runs a command through work-at.",
      execution: {
        kind: "work-at",
        workTargetParam: "workTarget",
      },
      command: ["bash", "-lc", "printf ok"],
      timeoutMs: 5000,
    })
    writeJson(join(healthRoot, "profiles", "test.health-profile.json"), {
      id: "test_profile",
      title: "Test Profile",
      description: "Runs one work-at check.",
      checks: [
        {
          id: "remote_echo_binding",
          checkId: "remote_echo",
          title: "Remote echo binding",
          severity: "blocking",
          params: {
            workTarget: "demo-target",
          },
        },
      ],
    })

    const report = runWorkspaceHealthProfile({
      profileId: "test_profile",
      workspaceHealthRoot: healthRoot,
      workAtBin: fakeWorkAtPath,
    })

    expect(report.status).toBe("healthy")
    expect(report.findings[0]?.command).toEqual([
      fakeWorkAtPath,
      "demo-target",
      "bash",
      "-lc",
      "printf ok",
    ])
    expect(readFileSync(capturePath, "utf8").trim().split("\n")).toEqual([
      "demo-target",
      "bash",
      "-lc",
      "printf ok",
    ])
    expect(readFileSync(join(root, "captured-env.txt"), "utf8").trim()).toBe(
      "SUPPRESS=1",
    )
  })

  test("applies explicit parameter overrides", () => {
    const root = createTempRoot()
    const healthRoot = join(root, "workspace", "health")

    writeJson(join(healthRoot, "checks", "path-exists.health-check.json"), {
      id: "path_exists",
      title: "Required path exists",
      description: "Path exists.",
      execution: { kind: "local" },
      command: ["bash", "-lc", "test -e {{path}}"],
      timeoutMs: 5000,
    })
    writeJson(join(healthRoot, "profiles", "test.health-profile.json"), {
      id: "test_profile",
      title: "Test Profile",
      description: "Runs one local file check.",
      params: {
        path: join(root, "missing.txt"),
      },
      checks: [
        {
          id: "path_binding",
          checkId: "path_exists",
          title: "Path binding",
          severity: "blocking",
          params: {},
        },
      ],
    })

    const passFile = join(root, "override.txt")
    writeFileSync(passFile, "ok\n")
    const report = runWorkspaceHealthProfile({
      profileId: "test_profile",
      workspaceHealthRoot: healthRoot,
      paramOverrides: {
        path: passFile,
      },
    })

    expect(report.status).toBe("healthy")
    expect(report.findings[0]?.command).toEqual([
      "bash",
      "-lc",
      `test -e ${passFile}`,
    ])
  })
})
