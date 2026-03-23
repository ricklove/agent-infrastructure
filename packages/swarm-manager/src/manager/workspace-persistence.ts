import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

type WorkspacePersistenceRequest = {
  requestedAtMs: number;
  flushNow?: boolean;
  reason?: string;
  source?: string;
};

const stateRoot = process.env.AGENT_STATE_DIR?.trim() || "/home/ec2-user/state";
const workspaceRoot = process.env.AGENT_WORKSPACE_DIR?.trim() || "/home/ec2-user/workspace";
const agentChatDataDir =
  process.env.AGENT_CHAT_DATA_DIR?.trim() || `${workspaceRoot}/data/agent-chat`;
const SYSTEM_EVENT_LOG_PATH =
  process.env.SYSTEM_EVENT_LOG_PATH?.trim() || `${stateRoot}/logs/system-events.log`;
const workspacePersistenceRequestPath = resolve(stateRoot, "workspace-persistence-request.json");
const workspacePersistenceIncidentDir = resolve(stateRoot, "workspace-persistence-incidents");
const workspacePersistenceDebounceMs =
  Math.max(
    5,
    Number.parseInt(process.env.WORKSPACE_PERSISTENCE_DEBOUNCE_SECONDS ?? "15", 10) || 15,
  ) * 1000;
const workspacePersistencePollMs =
  Math.max(
    2,
    Number.parseInt(process.env.WORKSPACE_PERSISTENCE_POLL_SECONDS ?? "5", 10) || 5,
  ) * 1000;
const workspacePersistencePushRetryMs =
  Math.max(
    15,
    Number.parseInt(process.env.WORKSPACE_PERSISTENCE_PUSH_RETRY_SECONDS ?? "60", 10) || 60,
  ) * 1000;

function logSystemStep(source: string, message: string): void {
  const line = `[${new Date().toISOString()}:${source}] ${message}`;
  mkdirSync(dirname(SYSTEM_EVENT_LOG_PATH), { recursive: true });
  appendFileSync(SYSTEM_EVENT_LOG_PATH, `${line}\n`);
  console.error(line);
}

function readRequest(): WorkspacePersistenceRequest | null {
  if (!existsSync(workspacePersistenceRequestPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(workspacePersistenceRequestPath, "utf8")) as WorkspacePersistenceRequest;
  } catch {
    return null;
  }
}

function clearRequest(): void {
  rmSync(workspacePersistenceRequestPath, { force: true });
}

function writeIncident(detail: string): string {
  mkdirSync(workspacePersistenceIncidentDir, { recursive: true });
  const incidentPath = resolve(
    workspacePersistenceIncidentDir,
    `${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    incidentPath,
    `${JSON.stringify(
      {
        at: new Date().toISOString(),
        detail,
      },
      null,
      2,
    )}\n`,
  );
  return incidentPath;
}

function runGit(command: string[], cwd: string): string {
  const result = Bun.spawnSync(command, {
    cwd,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString("utf8").trim() || `command failed: ${command.join(" ")}`);
  }

  return result.stdout.toString("utf8").trim();
}

function hasCachedChanges(repoRoot: string, targetPath: string): boolean {
  const result = Bun.spawnSync(["git", "diff", "--cached", "--quiet", "--", targetPath], {
    cwd: repoRoot,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return result.exitCode === 1;
}

function hasUnpushedCommits(repoRoot: string): boolean {
  const upstream = Bun.spawnSync(
    ["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    {
      cwd: repoRoot,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  if (upstream.exitCode !== 0) {
    return true;
  }

  const ahead = runGit(["git", "rev-list", "--count", "@{u}..HEAD"], repoRoot);
  return Number.parseInt(ahead || "0", 10) > 0;
}

function persistWorkspaceRepo(): { committed: boolean; pushed: boolean } {
  const repoRoot = runGit(["git", "rev-parse", "--show-toplevel"], workspaceRoot);
  const relativeTarget = relative(repoRoot, agentChatDataDir) || ".";

  if (relativeTarget.startsWith("..")) {
    throw new Error(`agent chat data dir is outside workspace repo: ${agentChatDataDir}`);
  }

  runGit(["git", "add", "--all", "--", relativeTarget], repoRoot);

  const committed = hasCachedChanges(repoRoot, relativeTarget);
  if (committed) {
    runGit(["git", "commit", "-m", "Record agent chat workspace data"], repoRoot);
  }

  const pushed = hasUnpushedCommits(repoRoot);
  if (pushed) {
    runGit(["git", "push"], repoRoot);
  }

  return {
    committed,
    pushed,
  };
}

export function requestWorkspacePersistence(input?: {
  reason?: string;
  source?: string;
  flushNow?: boolean;
}): void {
  const current = readRequest();
  const next: WorkspacePersistenceRequest = {
    requestedAtMs: Date.now(),
    flushNow: Boolean(input?.flushNow || current?.flushNow),
    reason: input?.reason?.trim() || current?.reason || "manual",
    source: input?.source?.trim() || current?.source || "unknown",
  };
  mkdirSync(dirname(workspacePersistenceRequestPath), { recursive: true });
  writeFileSync(workspacePersistenceRequestPath, `${JSON.stringify(next, null, 2)}\n`);
}

export async function runWorkspacePersistenceController(): Promise<void> {
  let lastFailureAtMs = 0;

  logSystemStep(
    "workspace-persistence-controller",
    `start workspace_root=${workspaceRoot} agent_chat_data_dir=${agentChatDataDir}`,
  );

  while (true) {
    const request = readRequest();
    if (!request) {
      await Bun.sleep(workspacePersistencePollMs);
      continue;
    }

    const now = Date.now();
    const ready =
      request.flushNow === true || now - request.requestedAtMs >= workspacePersistenceDebounceMs;
    if (!ready) {
      await Bun.sleep(workspacePersistencePollMs);
      continue;
    }

    if (lastFailureAtMs > 0 && now - lastFailureAtMs < workspacePersistencePushRetryMs) {
      await Bun.sleep(workspacePersistencePollMs);
      continue;
    }

    try {
      const result = persistWorkspaceRepo();
      clearRequest();
      lastFailureAtMs = 0;
      logSystemStep(
        "workspace-persistence-controller",
        `exit committed=${result.committed} pushed=${result.pushed} reason=${request.reason || "unknown"} source=${request.source || "unknown"}`,
      );
    } catch (error) {
      lastFailureAtMs = Date.now();
      const detail =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error);
      const incidentPath = writeIncident(detail);
      logSystemStep(
        "workspace-persistence-controller",
        `error detail=${detail} incident=${incidentPath}`,
      );
    }

    await Bun.sleep(workspacePersistencePollMs);
  }
}
