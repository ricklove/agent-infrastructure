import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { importLegacyInstallations, installationEnvPath, installationPemPath } from "./registry.js";

describe("importLegacyInstallations", () => {
  test("copies legacy pem material into the managed installation directory", () => {
    const root = join(
      "/tmp",
      `projects-server-import-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const configRoot = join(root, "config");
    const legacyRoot = join(configRoot, "@example");
    mkdirSync(legacyRoot, { recursive: true });
    writeFileSync(join(legacyRoot, "github-app.pem"), "legacy pem\n", { mode: 0o600 });
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
    );

    const result = importLegacyInstallations(configRoot, { installations: [], projects: [] }, 1000);
    expect(result.changed).toBe(true);
    expect(result.registry.installations).toHaveLength(1);

    const installation = result.registry.installations[0]!;
    expect(installation.pemPath).toBe(installationPemPath(configRoot, "5678"));
    expect(readFileSync(installation.pemPath, "utf8")).toBe("legacy pem\n");
    expect(readFileSync(installationEnvPath(configRoot, "5678"), "utf8")).toContain(
      `GITHUB_APP_PEM=${installation.pemPath}`,
    );
  });

  test("updates an existing imported installation to the managed pem path", () => {
    const root = join(
      "/tmp",
      `projects-server-import-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const configRoot = join(root, "config");
    const legacyRoot = join(configRoot, "@example");
    mkdirSync(legacyRoot, { recursive: true });
    writeFileSync(join(legacyRoot, "github-app.pem"), "legacy pem two\n", { mode: 0o600 });
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
    );

    const existing = {
      installations: [
        {
          id: "existing-id",
          label: "Example GitHub App",
          accountLogin: "example",
          appId: "1234",
          installationId: "5678",
          pemPath: join(legacyRoot, "github-app.pem"),
          createdAtMs: 1,
          updatedAtMs: 1,
        },
      ],
      projects: [],
    };

    const result = importLegacyInstallations(configRoot, existing, 2000);
    expect(result.changed).toBe(true);
    expect(result.registry.installations).toHaveLength(1);
    expect(result.registry.installations[0]?.id).toBe("existing-id");
    expect(result.registry.installations[0]?.createdAtMs).toBe(1);
    expect(result.registry.installations[0]?.updatedAtMs).toBe(2000);
    expect(result.registry.installations[0]?.pemPath).toBe(installationPemPath(configRoot, "5678"));
  });
});
