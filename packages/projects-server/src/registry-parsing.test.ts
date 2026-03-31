import { describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  installationEnvPath,
  parseEnvFile,
  persistInstallationEnv,
  readRegistry,
} from "./registry.js"

describe("registry helpers", () => {
  test("parseEnvFile ignores comments, blank lines, and malformed entries", () => {
    const root = join(
      "/tmp",
      `projects-server-parse-env-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    )
    mkdirSync(root, { recursive: true })
    const envPath = join(root, "installation.env")
    writeFileSync(
      envPath,
      [
        "# comment",
        "",
        "GITHUB_APP_ID = 1234",
        "GITHUB_INSTALLATION_ID=5678",
        "MALFORMED_LINE",
        "GITHUB_ACCOUNT_LOGIN = example",
        "",
      ].join("\n"),
      { mode: 0o600 },
    )

    expect(parseEnvFile(envPath)).toEqual({
      GITHUB_APP_ID: "1234",
      GITHUB_INSTALLATION_ID: "5678",
      GITHUB_ACCOUNT_LOGIN: "example",
    })
  })

  test("readRegistry persists imported legacy installations into managed env files", () => {
    const root = join(
      "/tmp",
      `projects-server-read-registry-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    )
    const configRoot = join(root, "config")
    const legacyRoot = join(configRoot, "@example")
    const registryPath = join(root, "data", "registry.json")
    mkdirSync(legacyRoot, { recursive: true })
    writeFileSync(join(legacyRoot, "github-app.pem"), "legacy pem\n", {
      mode: 0o600,
    })
    writeFileSync(
      join(legacyRoot, "env"),
      [
        "GITHUB_APP_ID=1234",
        "GITHUB_INSTALLATION_ID=5678",
        `GITHUB_APP_PEM=${join(legacyRoot, "github-app.pem")}`,
        "GITHUB_ACCOUNT_LOGIN=example",
        "",
      ].join("\n"),
      { mode: 0o600 },
    )

    const registry = readRegistry(registryPath, configRoot)

    expect(registry.installations).toHaveLength(1)
    expect(readFileSync(registryPath, "utf8")).toContain("5678")
    expect(
      readFileSync(installationEnvPath(configRoot, "5678"), "utf8"),
    ).toContain("GITHUB_ACCOUNT_LOGIN=example")
  })

  test("persistInstallationEnv writes a normalized managed env file", () => {
    const root = join(
      "/tmp",
      `projects-server-persist-env-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    )
    mkdirSync(root, { recursive: true })

    persistInstallationEnv(root, {
      id: "installation-1",
      label: "Example GitHub App",
      accountLogin: "example",
      appId: "1234",
      installationId: "5678",
      pemPath: "/tmp/example.pem",
      createdAtMs: 1,
      updatedAtMs: 2,
    })

    expect(readFileSync(installationEnvPath(root, "5678"), "utf8")).toBe(
      [
        "GITHUB_APP_ID=1234",
        "GITHUB_INSTALLATION_ID=5678",
        "GITHUB_APP_PEM=/tmp/example.pem",
        "GITHUB_ACCOUNT_LOGIN=example",
        "",
      ].join("\n"),
    )
  })
})
