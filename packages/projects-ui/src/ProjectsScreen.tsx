import { useEffect, useMemo, useState } from "react";

type InstallationSummary = {
  id: string;
  label: string;
  accountLogin: string;
  appId: string;
  installationId: string;
  repoCount: number | null;
  createdAtMs: number;
  updatedAtMs: number;
};

type AccessibleRepo = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  } | null;
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
  status: {
    localRepoExists: boolean;
    authConfigured: boolean;
    localPathAllowed: boolean;
  };
};

export type ProjectsScreenProps = {
  apiRootUrl?: string;
};

const sessionStorageKey = "agent-infrastructure.dashboard.session";

function readStoredSessionToken(): string {
  return window.sessionStorage.getItem(sessionStorageKey) ?? "";
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const sessionToken = readStoredSessionToken();
  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }
  return fetch(path, {
    ...init,
    headers,
  });
}

function featurePath(apiRootUrl: string, pathname: string): string {
  const trimmedRoot = apiRootUrl.replace(/\/+$/, "");
  const trimmedPath = pathname.replace(/^\/+/, "");
  if (!trimmedPath) {
    return trimmedRoot;
  }
  return `${trimmedRoot}/${trimmedPath}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function defaultLocalPath(owner: string, repo: string) {
  return `/home/ec2-user/workspace/projects/${owner}-${repo}`;
}

export function ProjectsScreen({
  apiRootUrl = "/api/projects",
}: ProjectsScreenProps) {
  const [activeMobileSection, setActiveMobileSection] = useState<"github" | "projects">("github");
  const [installations, setInstallations] = useState<InstallationSummary[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState("");
  const [accessibleRepos, setAccessibleRepos] = useState<AccessibleRepo[]>([]);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingInstallation, setSavingInstallation] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [importingProjects, setImportingProjects] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState("");
  const [installationForm, setInstallationForm] = useState({
    label: "",
    accountLogin: "",
    appId: "",
    installationId: "",
    pemText: "",
  });
  const [projectForm, setProjectForm] = useState({
    name: "",
    localPath: "",
    baseBranch: "development",
    postMergeBunCommand: "",
    cloneOnCreate: true,
  });

  async function loadAll(selectedId?: string) {
    setError("");
    const [installationsResponse, projectsResponse] = await Promise.all([
      apiFetch(featurePath(apiRootUrl, "installations")),
      apiFetch(featurePath(apiRootUrl, "")),
    ]);

    if (!installationsResponse.ok) {
      throw new Error(await installationsResponse.text());
    }
    if (!projectsResponse.ok) {
      throw new Error(await projectsResponse.text());
    }

    const installationsPayload = (await installationsResponse.json()) as {
      installations: InstallationSummary[];
    };
    const projectsPayload = (await projectsResponse.json()) as {
      projects: ProjectRecord[];
    };
    setInstallations(installationsPayload.installations);
    setProjects(projectsPayload.projects);

    const nextInstallationId =
      selectedId ||
      selectedInstallationId ||
      installationsPayload.installations[0]?.id ||
      "";
    setSelectedInstallationId(nextInstallationId);
    if (nextInstallationId) {
      await loadRepos(nextInstallationId);
    } else {
      setAccessibleRepos([]);
      setSelectedRepoFullName("");
    }
  }

  async function loadRepos(installationId: string) {
    if (!installationId) {
      setAccessibleRepos([]);
      setSelectedRepoFullName("");
      return;
    }

    const response = await apiFetch(
      featurePath(apiRootUrl, `installations/${encodeURIComponent(installationId)}/repos`),
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const payload = (await response.json()) as { repositories: AccessibleRepo[] };
    setAccessibleRepos(payload.repositories);
    setSelectedRepoFullName((current) => {
      if (payload.repositories.some((repo) => repo.fullName === current)) {
        return current;
      }
      return payload.repositories[0]?.fullName ?? "";
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAll().catch((nextError) => {
      if (!cancelled) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }).finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRepo = useMemo(
    () => accessibleRepos.find((repo) => repo.fullName === selectedRepoFullName) ?? null,
    [accessibleRepos, selectedRepoFullName],
  );

  useEffect(() => {
    if (!selectedRepo) {
      return;
    }
    setProjectForm((current) => ({
      ...current,
      name: current.name || selectedRepo.name,
      localPath:
        current.localPath || defaultLocalPath(selectedRepo.owner, selectedRepo.name),
      baseBranch: current.baseBranch || selectedRepo.defaultBranch || "development",
    }));
  }, [selectedRepo]);

  async function handleInstallationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingInstallation(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch(featurePath(apiRootUrl, "installations"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(installationForm),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as { installation: InstallationSummary };
      setInstallationForm({
        label: "",
        accountLogin: "",
        appId: "",
        installationId: "",
        pemText: "",
      });
      await loadAll(payload.installation.id);
      setSuccess(`Saved GitHub App installation ${payload.installation.label}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSavingInstallation(false);
    }
  }

  async function handleProjectSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRepo || !selectedInstallationId) {
      setError("Select a GitHub installation and repository first.");
      return;
    }

    setCreatingProject(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch(featurePath(apiRootUrl, ""), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectForm.name.trim() || selectedRepo.name,
          localPath: projectForm.localPath.trim(),
          baseBranch: projectForm.baseBranch.trim() || selectedRepo.defaultBranch,
          postMergeBunCommand: projectForm.postMergeBunCommand.trim(),
          installationId: selectedInstallationId,
          owner: selectedRepo.owner,
          repo: selectedRepo.name,
          remoteUrl: selectedRepo.cloneUrl,
          cloneOnCreate: projectForm.cloneOnCreate,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as { project: ProjectRecord };
      await loadAll(selectedInstallationId);
      setProjectForm({
        name: payload.project.name,
        localPath: payload.project.localPath,
        baseBranch: payload.project.baseBranch,
        postMergeBunCommand: payload.project.postMergeBunCommand,
        cloneOnCreate: true,
      });
      setSuccess(`Created project ${payload.project.name}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setCreatingProject(false);
    }
  }

  async function saveProjectSettings(project: ProjectRecord) {
    setError("");
    setSuccess("");
    const response = await apiFetch(
      featurePath(apiRootUrl, encodeURIComponent(project.id)),
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseBranch: project.baseBranch,
          postMergeBunCommand: project.postMergeBunCommand,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    await loadAll(selectedInstallationId);
    setSuccess(`Saved integration settings for ${project.name}.`);
  }

  async function importExistingProjects() {
    setImportingProjects(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch(featurePath(apiRootUrl, "import-existing"), {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as {
        imported: ProjectRecord[];
        skipped: Array<{ localPath: string; reason: string }>;
      };
      await loadAll(selectedInstallationId);

      if (payload.imported.length > 0) {
        setSuccess(
          `Imported ${payload.imported.length} existing project${payload.imported.length === 1 ? "" : "s"}.`,
        );
        return;
      }

      if (payload.skipped.length > 0) {
        setSuccess(`No new projects imported. ${payload.skipped[0]?.reason ?? "All candidates were skipped."}`);
        return;
      }

      setSuccess("No local repos found under /home/ec2-user/workspace/projects.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setImportingProjects(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-950 text-stone-100">
      <div className="border-b border-stone-800 px-6 py-4">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 max-w-3xl text-sm text-stone-400">
          Add GitHub App access first for private repos, then discover repos from that installation and
          create managed workspace projects with a base branch and post-merge bun command.
        </p>
      </div>

      <div className="border-b border-stone-800 px-4 py-3 lg:hidden">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-800 bg-stone-900/70 p-1">
          <button
            type="button"
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              activeMobileSection === "github"
                ? "bg-emerald-400 text-stone-950"
                : "text-stone-300 hover:bg-stone-800"
            }`}
            onClick={() => setActiveMobileSection("github")}
          >
            GitHub Access
          </button>
          <button
            type="button"
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              activeMobileSection === "projects"
                ? "bg-sky-400 text-stone-950"
                : "text-stone-300 hover:bg-stone-800"
            }`}
            onClick={() => setActiveMobileSection("projects")}
          >
            Projects
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[28rem_minmax(0,1fr)]">
        <section
          className={`flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-stone-800 bg-stone-900/80 p-4 ${
            activeMobileSection === "github" ? "flex" : "hidden"
          } lg:flex`}
        >
          <div>
            <h2 className="text-lg font-semibold text-stone-100">GitHub Access</h2>
            <p className="text-sm text-stone-400">
              Configure a GitHub App installation so private repos can be discovered and cloned.
            </p>
          </div>

          <form className="space-y-3" onSubmit={handleInstallationSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-stone-300">Label</span>
                <input
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
                  value={installationForm.label}
                  onChange={(event) =>
                    setInstallationForm((current) => ({ ...current, label: event.target.value }))
                  }
                  placeholder="Agent Team Admin"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-stone-300">Account / Org</span>
                <input
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
                  value={installationForm.accountLogin}
                  onChange={(event) =>
                    setInstallationForm((current) => ({
                      ...current,
                      accountLogin: event.target.value,
                    }))
                  }
                  placeholder="my-org"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-stone-300">GitHub App ID</span>
                <input
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
                  value={installationForm.appId}
                  onChange={(event) =>
                    setInstallationForm((current) => ({ ...current, appId: event.target.value }))
                  }
                  placeholder="123456"
                  required
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-stone-300">Installation ID</span>
                <input
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
                  value={installationForm.installationId}
                  onChange={(event) =>
                    setInstallationForm((current) => ({
                      ...current,
                      installationId: event.target.value,
                    }))
                  }
                  placeholder="7890123"
                  required
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="text-stone-300">GitHub App PEM</span>
              <textarea
                className="min-h-40 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 font-mono text-xs"
                value={installationForm.pemText}
                onChange={(event) =>
                  setInstallationForm((current) => ({ ...current, pemText: event.target.value }))
                }
                placeholder="-----BEGIN RSA PRIVATE KEY-----"
                required
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={savingInstallation}
            >
              {savingInstallation ? "Saving GitHub App..." : "Add GitHub App"}
            </button>
          </form>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
                Installations
              </h3>
            </div>
            <div className="space-y-2">
              {installations.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-700 px-3 py-4 text-sm text-stone-500">
                  No GitHub App installations configured yet.
                </p>
              ) : (
                installations.map((installation) => (
                  <button
                    key={installation.id}
                    type="button"
                    className={`w-full rounded-xl border px-3 py-3 text-left ${
                      installation.id === selectedInstallationId
                        ? "border-emerald-400 bg-emerald-500/10"
                        : "border-stone-800 bg-stone-950/70 hover:border-stone-700"
                    }`}
                    onClick={() => {
                      setSelectedInstallationId(installation.id);
                      loadRepos(installation.id).catch((nextError) => {
                        setError(
                          nextError instanceof Error ? nextError.message : String(nextError),
                        );
                      });
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-stone-100">{installation.label}</span>
                      <span className="text-xs text-stone-500">{installation.accountLogin}</span>
                    </div>
                    <div className="mt-1 text-xs text-stone-400">
                      app {installation.appId} · installation {installation.installationId}
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      repos visible: {installation.repoCount ?? "unknown"}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section
          className={`min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-stone-800 bg-stone-900/80 p-4 ${
            activeMobileSection === "projects" ? "flex" : "hidden"
          } lg:flex`}
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-stone-100">Accessible Repos</h2>
                <p className="text-sm text-stone-400">
                  Choose a private repo from the selected GitHub App installation.
                </p>
              </div>
              <div className="space-y-2">
                {accessibleRepos.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-stone-700 px-3 py-4 text-sm text-stone-500">
                    Select a GitHub App installation to load its accessible repositories.
                  </p>
                ) : (
                  accessibleRepos.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      className={`w-full rounded-xl border px-3 py-3 text-left ${
                        repo.fullName === selectedRepoFullName
                          ? "border-sky-400 bg-sky-500/10"
                          : "border-stone-800 bg-stone-950/70 hover:border-stone-700"
                      }`}
                      onClick={() => {
                        setSelectedRepoFullName(repo.fullName);
                        setProjectForm((current) => ({
                          ...current,
                          name: repo.name,
                          localPath: defaultLocalPath(repo.owner, repo.name),
                          baseBranch: repo.defaultBranch || "development",
                        }));
                      }}
                    >
                      <div className="font-medium text-stone-100">{repo.fullName}</div>
                      <div className="mt-1 text-xs text-stone-400">
                        default branch {repo.defaultBranch || "unknown"} · {repo.private ? "private" : "public"}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        permissions: {repo.permissions?.pull ? "pull" : "-"} / {repo.permissions?.push ? "push" : "-"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-stone-100">Create Project</h2>
                <p className="text-sm text-stone-400">
                  Store the repo as a managed project, clone it into the workspace, and define the
                  shared workflow parameters agents need.
                </p>
              </div>

              <form className="space-y-3" onSubmit={handleProjectSubmit}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-stone-300">Project name</span>
                    <input
                      className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
                      value={projectForm.name}
                      onChange={(event) =>
                        setProjectForm((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-stone-300">Base branch</span>
                    <input
                      className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
                      value={projectForm.baseBranch}
                      onChange={(event) =>
                        setProjectForm((current) => ({
                          ...current,
                          baseBranch: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-sm">
                  <span className="text-stone-300">Local path</span>
                  <input
                    className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 font-mono text-sm"
                    value={projectForm.localPath}
                    onChange={(event) =>
                      setProjectForm((current) => ({ ...current, localPath: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-stone-300">Post-merge bun command</span>
                  <input
                    className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm"
                    value={projectForm.postMergeBunCommand}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        postMergeBunCommand: event.target.value,
                      }))
                    }
                    placeholder="bun run deploy-manager-runtime"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-stone-300">
                  <input
                    type="checkbox"
                    checked={projectForm.cloneOnCreate}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        cloneOnCreate: event.target.checked,
                      }))
                    }
                  />
                  Clone the repository immediately when creating the project
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={creatingProject || !selectedRepo}
                >
                  {creatingProject ? "Creating project..." : "Add project from repo"}
                </button>
              </form>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {success}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-stone-100">Managed Projects</h2>
                <p className="text-sm text-stone-400">
                  Each project shares the same development process and only stores repo-specific
                  integration settings.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-stone-700 px-3 py-2 text-sm font-medium text-stone-200 hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  importExistingProjects().catch((nextError) => {
                    setError(nextError instanceof Error ? nextError.message : String(nextError));
                  });
                }}
                disabled={importingProjects}
              >
                {importingProjects ? "Importing..." : "Import Existing Projects"}
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-stone-400">Loading projects…</p>
            ) : projects.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-700 px-3 py-4 text-sm text-stone-500">
                No managed projects yet.
              </p>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => {
                  const isEditing = editingProjectId === project.id;
                  return (
                    <div
                      key={project.id}
                      className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-stone-100">
                            {project.name}
                          </h3>
                          <p className="text-sm text-stone-400">{project.owner}/{project.repo}</p>
                          <p className="mt-1 text-xs text-stone-500">{project.localPath}</p>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-200 hover:border-stone-500"
                          onClick={() =>
                            setEditingProjectId((current) =>
                              current === project.id ? "" : project.id,
                            )
                          }
                        >
                          {isEditing ? "Close" : "Edit settings"}
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-stone-800 px-2.5 py-1 text-stone-300">
                          base {project.baseBranch}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 ${
                            project.status.localRepoExists
                              ? "bg-emerald-500/15 text-emerald-200"
                              : "bg-amber-500/15 text-amber-200"
                          }`}
                        >
                          {project.status.localRepoExists ? "repo present" : "repo missing"}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 ${
                            project.status.authConfigured
                              ? "bg-sky-500/15 text-sky-200"
                              : "bg-rose-500/15 text-rose-200"
                          }`}
                        >
                          {project.status.authConfigured ? "auth configured" : "auth missing"}
                        </span>
                      </div>

                      <div className="mt-3 text-xs text-stone-500">
                        Updated {formatDate(project.updatedAtMs)}
                      </div>

                      {isEditing ? (
                        <form
                          className="mt-4 grid gap-3 md:grid-cols-[16rem_minmax(0,1fr)_auto]"
                          onSubmit={(event) => {
                            event.preventDefault();
                            saveProjectSettings(project).catch((nextError) => {
                              setError(
                                nextError instanceof Error ? nextError.message : String(nextError),
                              );
                            });
                          }}
                        >
                          <label className="space-y-1 text-sm">
                            <span className="text-stone-300">Base branch</span>
                            <input
                              className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm"
                              value={project.baseBranch}
                              onChange={(event) =>
                                setProjects((current) =>
                                  current.map((entry) =>
                                    entry.id === project.id
                                      ? { ...entry, baseBranch: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="text-stone-300">Post-merge bun command</span>
                            <input
                              className="w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm"
                              value={project.postMergeBunCommand}
                              onChange={(event) =>
                                setProjects((current) =>
                                  current.map((entry) =>
                                    entry.id === project.id
                                      ? {
                                          ...entry,
                                          postMergeBunCommand: event.target.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                            />
                          </label>
                          <div className="flex items-end">
                            <button
                              type="submit"
                              className="rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-white"
                            >
                              Save
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
