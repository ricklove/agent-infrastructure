import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export type InstallationRecord = {
  id: string;
  label: string;
  accountLogin: string;
  appId: string;
  installationId: string;
  pemPath: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type ProjectRecord = {
  id: string;
  name: string;
  owner: string;
  repo: string;
  remoteUrl: string;
  localPath: string;
  installationId: string;
  baseBranch: string;
  postMergeBunCommand: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type ProjectsRegistry = {
  installations: InstallationRecord[];
  projects: ProjectRecord[];
};

export function installationDir(configRoot: string, installationId: string) {
  return join(configRoot, "installations", installationId);
}

export function installationEnvPath(configRoot: string, installationId: string) {
  return join(installationDir(configRoot, installationId), "env");
}

export function installationPemPath(configRoot: string, installationId: string) {
  return join(installationDir(configRoot, installationId), "github-app.pem");
}

export function readRegistryFile(registryPath: string): ProjectsRegistry {
  if (!existsSync(registryPath)) {
    return { installations: [], projects: [] };
  }
  try {
    return JSON.parse(readFileSync(registryPath, "utf8")) as ProjectsRegistry;
  } catch {
    return { installations: [], projects: [] };
  }
}

export function writeRegistry(registryPath: string, registry: ProjectsRegistry) {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
}

export function parseEnvFile(envPath: string) {
  const values: Record<string, string> = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      values[key] = value;
    }
  }
  return values;
}

export function persistInstallationEnv(configRoot: string, installation: InstallationRecord) {
  mkdirSync(installationDir(configRoot, installation.installationId), { recursive: true });
  writeFileSync(
    installationEnvPath(configRoot, installation.installationId),
    [
      `GITHUB_APP_ID=${installation.appId}`,
      `GITHUB_INSTALLATION_ID=${installation.installationId}`,
      `GITHUB_APP_PEM=${installation.pemPath}`,
      `GITHUB_ACCOUNT_LOGIN=${installation.accountLogin}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
}

function syncManagedPem(configRoot: string, installationId: string, sourcePemPath: string) {
  const managedPemPath = installationPemPath(configRoot, installationId);
  mkdirSync(dirname(managedPemPath), { recursive: true });

  if (!existsSync(managedPemPath)) {
    copyFileSync(sourcePemPath, managedPemPath);
    return { pemPath: managedPemPath, changed: true };
  }

  if (readFileSync(managedPemPath, "utf8") !== readFileSync(sourcePemPath, "utf8")) {
    copyFileSync(sourcePemPath, managedPemPath);
    return { pemPath: managedPemPath, changed: true };
  }

  return { pemPath: managedPemPath, changed: false };
}

export function importLegacyInstallations(
  configRoot: string,
  registry: ProjectsRegistry,
  now = Date.now(),
) {
  if (!existsSync(configRoot)) {
    return { registry, changed: false };
  }

  const installationsById = new Map(
    registry.installations.map((installation) => [installation.installationId, installation]),
  );
  let changed = false;

  for (const entry of readdirSync(configRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("@")) {
      continue;
    }

    const envPath = join(configRoot, entry.name, "env");
    if (!existsSync(envPath)) {
      continue;
    }

    const env = parseEnvFile(envPath);
    const appId = env.GITHUB_APP_ID?.trim();
    const installationId = env.GITHUB_INSTALLATION_ID?.trim();
    const sourcePemPath =
      env.GITHUB_APP_PEM?.trim() || join(configRoot, entry.name, "github-app.pem");
    const accountLogin =
      env.GITHUB_ACCOUNT_LOGIN?.trim() || entry.name.replace(/^@/, "").trim();

    if (!appId || !installationId || !accountLogin || !existsSync(sourcePemPath)) {
      continue;
    }

    const existing = installationsById.get(installationId);
    const managedPem = syncManagedPem(configRoot, installationId, sourcePemPath);
    if (managedPem.changed) {
      changed = true;
    }

    const installation: InstallationRecord = {
      id: existing?.id ?? randomUUID(),
      label: existing?.label || `${accountLogin} GitHub App`,
      accountLogin,
      appId,
      installationId,
      pemPath: managedPem.pemPath,
      createdAtMs: existing?.createdAtMs ?? now,
      updatedAtMs:
        existing &&
        existing.label === (existing?.label || `${accountLogin} GitHub App`) &&
        existing.accountLogin === accountLogin &&
        existing.appId === appId &&
        existing.pemPath === managedPem.pemPath
          ? existing.updatedAtMs
          : now,
    };

    persistInstallationEnv(configRoot, installation);
    const existingEnv = installationsById.get(installationId);
    if (
      !existingEnv ||
      existingEnv.accountLogin !== installation.accountLogin ||
      existingEnv.appId !== installation.appId ||
      existingEnv.pemPath !== installation.pemPath ||
      existingEnv.label !== installation.label
    ) {
      changed = true;
    }

    if (existing) {
      const index = registry.installations.findIndex(
        (candidate) => candidate.installationId === installation.installationId,
      );
      registry.installations[index] = installation;
      installationsById.set(installation.installationId, installation);
      continue;
    }

    registry.installations.push(installation);
    installationsById.set(installation.installationId, installation);
    changed = true;
  }

  if (changed) {
    registry.installations.sort((left, right) => left.label.localeCompare(right.label));
  }

  return { registry, changed };
}

export function readRegistry(registryPath: string, configRoot: string): ProjectsRegistry {
  const imported = importLegacyInstallations(configRoot, readRegistryFile(registryPath));
  if (imported.changed) {
    writeRegistry(registryPath, imported.registry);
  }
  return imported.registry;
}
