import { createPrivateKey, createSign, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const stateDir = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state";
const workspaceRoot = process.env.AGENT_WORKSPACE_DIR?.trim() || "/home/ec2-user/workspace";
const appDataDir =
  process.env.AGENT_PROJECTS_DATA_DIR?.trim() || "/home/ec2-user/workspace/data/projects";
const logPath =
  process.env.PROJECTS_LOG_PATH?.trim() || `${stateDir}/logs/projects-server.log`;
const configRoot =
  process.env.AGENT_GITHUB_CONFIG_ROOT?.trim() || "/home/ec2-user/.config/agent-github";
const registryPath =
  process.env.AGENT_PROJECTS_REGISTRY_PATH?.trim() || `${appDataDir}/registry.json`;
const port = Number.parseInt(process.env.PROJECTS_PORT ?? "8791", 10);
const githubApiBaseUrl = process.env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com";

type InstallationRecord = {
  id: string;
  label: string;
  accountLogin: string;
  appId: string;
  installationId: string;
  pemPath: string;
  createdAtMs: number;
  updatedAtMs: number;
};

type ProjectRecord = {
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

type ProjectsRegistry = {
  installations: InstallationRecord[];
  projects: ProjectRecord[];
};

type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  default_branch: string;
  private: boolean;
  owner?: { login?: string };
  permissions?: {
    admin?: boolean;
    push?: boolean;
    pull?: boolean;
  };
};

mkdirSync(dirname(logPath), { recursive: true });
mkdirSync(appDataDir, { recursive: true });
mkdirSync(configRoot, { recursive: true });

function log(message: string) {
  appendFileSync(logPath, `[${new Date().toISOString()}:projects-server] ${message}\n`);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function textError(message: string, status = 400): Response {
  return new Response(message, { status });
}

function readRegistryFile(): ProjectsRegistry {
  if (!existsSync(registryPath)) {
    return { installations: [], projects: [] };
  }
  try {
    return JSON.parse(readFileSync(registryPath, "utf8")) as ProjectsRegistry;
  } catch {
    return { installations: [], projects: [] };
  }
}

function writeRegistry(registry: ProjectsRegistry) {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
}

function parseEnvFile(envPath: string) {
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

function persistInstallationEnv(installation: InstallationRecord) {
  mkdirSync(installationDir(installation.installationId), { recursive: true });
  writeFileSync(
    installationEnvPath(installation.installationId),
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

function importLegacyInstallations(registry: ProjectsRegistry) {
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
    const pemPath = env.GITHUB_APP_PEM?.trim() || join(configRoot, entry.name, "github-app.pem");
    const accountLogin =
      env.GITHUB_ACCOUNT_LOGIN?.trim() || entry.name.replace(/^@/, "").trim();

    if (!appId || !installationId || !accountLogin || !existsSync(pemPath)) {
      continue;
    }

    const existing = installationsById.get(installationId);
    const now = Date.now();
    const installation: InstallationRecord = {
      id: existing?.id ?? randomUUID(),
      label: existing?.label || `${accountLogin} GitHub App`,
      accountLogin,
      appId,
      installationId,
      pemPath,
      createdAtMs: existing?.createdAtMs ?? now,
      updatedAtMs: existing?.updatedAtMs ?? now,
    };

    const envMirrorPath = installationEnvPath(installationId);
    if (!existsSync(envMirrorPath)) {
      persistInstallationEnv(installation);
      changed = true;
    }

    if (!existing) {
      registry.installations.push(installation);
      installationsById.set(installationId, installation);
      changed = true;
    }
  }

  if (changed) {
    registry.installations.sort((left, right) => left.label.localeCompare(right.label));
  }

  return { registry, changed };
}

function readRegistry(): ProjectsRegistry {
  const imported = importLegacyInstallations(readRegistryFile());
  if (imported.changed) {
    writeRegistry(imported.registry);
  }
  return imported.registry;
}

function installationDir(installationId: string) {
  return join(configRoot, "installations", installationId);
}

function installationEnvPath(installationId: string) {
  return join(installationDir(installationId), "env");
}

function installationPemPath(installationId: string) {
  return join(installationDir(installationId), "github-app.pem");
}

function base64UrlFromBuffer(input: Buffer) {
  return input.toString("base64url");
}

function createAppJwt(installation: InstallationRecord) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlFromBuffer(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64UrlFromBuffer(
    Buffer.from(
      JSON.stringify({
        iat: now - 60,
        exp: now + 540,
        iss: installation.appId,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const privateKey = createPrivateKey(readFileSync(installation.pemPath, "utf8"));
  const signature = signer.sign(privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

async function fetchInstallationToken(installation: InstallationRecord) {
  const jwt = createAppJwt(installation);
  const response = await fetch(
    `${githubApiBaseUrl}/app/installations/${installation.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub token request failed (${response.status}) ${await response.text()}`);
  }
  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error("GitHub installation token response did not include a token");
  }
  return payload.token;
}

async function fetchAccessibleRepos(installation: InstallationRecord) {
  const token = await fetchInstallationToken(installation);
  const response = await fetch(`${githubApiBaseUrl}/installation/repositories?per_page=100`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub repository listing failed (${response.status}) ${await response.text()}`);
  }
  const payload = (await response.json()) as { repositories?: GithubRepo[] };
  return payload.repositories ?? [];
}

function ensureAllowedPath(pathValue: string) {
  const resolved = resolve(pathValue);
  const relativeToWorkspace = resolved.startsWith(`${workspaceRoot}/`) || resolved === workspaceRoot;
  if (!relativeToWorkspace) {
    throw new Error(`path must stay under ${workspaceRoot}`);
  }
  return resolved;
}

function normalizeRemoteInfo(remoteUrl: string) {
  const trimmed = remoteUrl.trim();
  const patterns = [
    /^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i,
    /^http:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i,
    /^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i,
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        owner: match[1]!,
        repo: match[2]!,
      };
    }
  }
  throw new Error(`unsupported GitHub remote URL: ${remoteUrl}`);
}

function authenticatedExtraHeader(token: string) {
  return `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
}

function runGit(args: string[], cwd?: string, extraEnv?: Record<string, string>) {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      ...extraEnv,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString("utf8").trim() || `git ${args.join(" ")} failed`);
  }

  return result.stdout.toString("utf8").trim();
}

async function validateInstallationAccess(installation: InstallationRecord) {
  const repos = await fetchAccessibleRepos(installation);
  return repos.length;
}

async function validateProjectBinding(project: ProjectRecord, installation: InstallationRecord) {
  const token = await fetchInstallationToken(installation);
  runGit(
    [
      "-c",
      `http.https://github.com/.extraheader=${authenticatedExtraHeader(token)}`,
      "ls-remote",
      "--exit-code",
      project.remoteUrl,
      "HEAD",
    ],
    workspaceRoot,
  );
}

async function cloneProjectRepo(project: ProjectRecord, installation: InstallationRecord) {
  const targetPath = ensureAllowedPath(project.localPath);
  if (existsSync(targetPath)) {
    const stats = statSync(targetPath);
    if (stats.isDirectory()) {
      const entries = readdirSafe(targetPath);
      if (entries.length > 0) {
        throw new Error(`clone target already exists and is not empty: ${targetPath}`);
      }
    }
  } else {
    mkdirSync(dirname(targetPath), { recursive: true });
  }
  const token = await fetchInstallationToken(installation);
  runGit(
    [
      "-c",
      `http.https://github.com/.extraheader=${authenticatedExtraHeader(token)}`,
      "clone",
      project.remoteUrl,
      targetPath,
    ],
    workspaceRoot,
  );
}

function readdirSafe(pathValue: string) {
  try {
    return Array.from(new Bun.Glob("*").scanSync({ cwd: pathValue }));
  } catch {
    return [];
  }
}

function projectStatus(project: ProjectRecord, registry: ProjectsRegistry) {
  const installation = registry.installations.find(
    (entry) => entry.installationId === project.installationId,
  );
  let localRepoExists = false;
  let localPathAllowed = false;
  try {
    const resolved = ensureAllowedPath(project.localPath);
    localPathAllowed = true;
    localRepoExists = existsSync(join(resolved, ".git"));
  } catch {
    localPathAllowed = false;
  }

  return {
    localRepoExists,
    authConfigured: Boolean(installation && existsSync(installationEnvPath(installation.installationId))),
    localPathAllowed,
  };
}

function installationSummary(installation: InstallationRecord, registry: ProjectsRegistry) {
  return {
    ...installation,
    repoCount: registry.projects.filter((project) => project.installationId === installation.installationId)
      .length,
  };
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/projects/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname === "/api/projects/installations" && request.method === "GET") {
      const registry = readRegistry();
      return jsonResponse({
        installations: registry.installations.map((installation) =>
          installationSummary(installation, registry),
        ),
      });
    }

    if (url.pathname === "/api/projects/installations" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          label?: string;
          accountLogin?: string;
          appId?: string;
          installationId?: string;
          pemText?: string;
        };
        const label = body.label?.trim();
        const accountLogin = body.accountLogin?.trim();
        const appId = body.appId?.trim();
        const installationId = body.installationId?.trim();
        const pemText = body.pemText?.trim();
        if (!label || !accountLogin || !appId || !installationId || !pemText) {
          return textError("label, accountLogin, appId, installationId, and pemText are required");
        }

        const registry = readRegistry();
        const now = Date.now();
        const installation: InstallationRecord = {
          id:
            registry.installations.find((entry) => entry.installationId === installationId)?.id ??
            randomUUID(),
          label,
          accountLogin,
          appId,
          installationId,
          pemPath: installationPemPath(installationId),
          createdAtMs:
            registry.installations.find((entry) => entry.installationId === installationId)?.createdAtMs ??
            now,
          updatedAtMs: now,
        };

        mkdirSync(installationDir(installationId), { recursive: true });
        writeFileSync(installation.pemPath, `${pemText}\n`, { mode: 0o600 });
        persistInstallationEnv(installation);

        await validateInstallationAccess(installation);

        registry.installations = [
          ...registry.installations.filter((entry) => entry.installationId !== installation.installationId),
          installation,
        ].sort((left, right) => left.label.localeCompare(right.label));
        writeRegistry(registry);

        return jsonResponse({
          ok: true,
          installation: installationSummary(installation, registry),
        });
      } catch (error) {
        log(`installation.save error=${String(error)}`);
        return textError(error instanceof Error ? error.message : String(error));
      }
    }

    const installationReposMatch = /^\/api\/projects\/installations\/([^/]+)\/repos$/.exec(url.pathname);
    if (installationReposMatch && request.method === "GET") {
      try {
        const installationId = decodeURIComponent(installationReposMatch[1]!);
        const registry = readRegistry();
        const installation = registry.installations.find((entry) => entry.id === installationId);
        if (!installation) {
          return textError("installation not found", 404);
        }
        const repositories = await fetchAccessibleRepos(installation);
        return jsonResponse({
          ok: true,
          repositories: repositories.map((repo) => ({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            owner: repo.owner?.login || installation.accountLogin,
            cloneUrl: repo.clone_url,
            defaultBranch: repo.default_branch,
            private: repo.private,
            permissions: repo.permissions
              ? {
                  admin: Boolean(repo.permissions.admin),
                  push: Boolean(repo.permissions.push),
                  pull: Boolean(repo.permissions.pull),
                }
              : null,
          })),
        });
      } catch (error) {
        log(`installation.repos error=${String(error)}`);
        return textError(error instanceof Error ? error.message : String(error));
      }
    }

    if (url.pathname === "/api/projects" && request.method === "GET") {
      const registry = readRegistry();
      return jsonResponse({
        projects: registry.projects
          .map((project) => ({
            ...project,
            status: projectStatus(project, registry),
          }))
          .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
      });
    }

    if (url.pathname === "/api/projects" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          name?: string;
          owner?: string;
          repo?: string;
          remoteUrl?: string;
          localPath?: string;
          installationId?: string;
          baseBranch?: string;
          postMergeBunCommand?: string;
          cloneOnCreate?: boolean;
        };
        const name = body.name?.trim();
        const owner = body.owner?.trim();
        const repo = body.repo?.trim();
        const remoteUrl = body.remoteUrl?.trim();
        const localPath = body.localPath?.trim();
        const installationId = body.installationId?.trim();
        const baseBranch = body.baseBranch?.trim();
        if (!name || !owner || !repo || !remoteUrl || !localPath || !installationId || !baseBranch) {
          return textError(
            "name, owner, repo, remoteUrl, localPath, installationId, and baseBranch are required",
          );
        }

        ensureAllowedPath(localPath);
        normalizeRemoteInfo(remoteUrl);

        const registry = readRegistry();
        const installation = registry.installations.find((entry) => entry.id === installationId);
        if (!installation) {
          return textError("installation not found", 404);
        }

        const now = Date.now();
        const project: ProjectRecord = {
          id: randomUUID(),
          name,
          owner,
          repo,
          remoteUrl,
          localPath,
          installationId: installation.installationId,
          baseBranch,
          postMergeBunCommand: body.postMergeBunCommand?.trim() || "",
          createdAtMs: now,
          updatedAtMs: now,
        };

        await validateProjectBinding(project, installation);

        if (body.cloneOnCreate !== false) {
          await cloneProjectRepo(project, installation);
        }

        registry.projects = [...registry.projects, project];
        writeRegistry(registry);

        return jsonResponse({
          ok: true,
          project: {
            ...project,
            status: projectStatus(project, registry),
          },
        });
      } catch (error) {
        log(`project.create error=${String(error)}`);
        return textError(error instanceof Error ? error.message : String(error));
      }
    }

    const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(url.pathname);
    if (projectMatch && request.method === "PATCH") {
      try {
        const projectId = decodeURIComponent(projectMatch[1]!);
        const body = (await request.json()) as {
          baseBranch?: string;
          postMergeBunCommand?: string;
        };
        const registry = readRegistry();
        const current = registry.projects.find((entry) => entry.id === projectId);
        if (!current) {
          return textError("project not found", 404);
        }

        const next: ProjectRecord = {
          ...current,
          baseBranch: body.baseBranch?.trim() || current.baseBranch,
          postMergeBunCommand:
            body.postMergeBunCommand === undefined
              ? current.postMergeBunCommand
              : body.postMergeBunCommand.trim(),
          updatedAtMs: Date.now(),
        };

        registry.projects = registry.projects.map((entry) =>
          entry.id === projectId ? next : entry,
        );
        writeRegistry(registry);

        return jsonResponse({
          ok: true,
          project: {
            ...next,
            status: projectStatus(next, registry),
          },
        });
      } catch (error) {
        log(`project.patch error=${String(error)}`);
        return textError(error instanceof Error ? error.message : String(error));
      }
    }

    return textError("not found", 404);
  },
});

log(`listening port=${server.port}`);
