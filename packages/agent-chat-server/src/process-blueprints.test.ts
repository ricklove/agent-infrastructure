import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  isProceduralProcessBlueprint,
  loadProcessBlueprintCatalog,
} from "./process-blueprints.js"

const tempDirs: string[] = []

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function createTempCatalogRoot() {
  const dir = mkdtempSync(join(tmpdir(), "process-blueprints-"))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("loadProcessBlueprintCatalog", () => {
  test("workspace step bundles override project bundles before process expansion", () => {
    const projectRoot = createTempCatalogRoot()
    const workspaceRoot = createTempCatalogRoot()
    const projectBlueprintDir = join(projectRoot, "process-blueprints")
    const projectStepDir = join(projectRoot, "process-steps")
    const workspaceStepDir = join(workspaceRoot, "process-steps")

    writeJson(join(projectStepDir, "worker-surface-setup.process-steps.json"), {
      id: "worker_surface_setup",
      title: "Project worker surface setup",
      steps: [{ id: "project_step", title: "Project step" }],
    })
    writeJson(
      join(workspaceStepDir, "worker-surface-setup.process-steps.json"),
      {
        id: "worker_surface_setup",
        title: "Workspace worker surface setup",
        steps: [{ id: "workspace_step", title: "Workspace step" }],
      },
    )
    writeJson(
      join(
        projectBlueprintDir,
        "full-development-process.process-blueprint.json",
      ),
      {
        id: "full_development_process",
        title: "Full Development Process",
        expectation: "Test process",
        idlePrompt: "idle",
        completionMode: "exact_reply",
        completionToken: "done: test",
        blockedToken: "blocked: test",
        stopConditions: [],
        watchdog: {
          enabled: true,
          idleTimeoutSeconds: 90,
          maxNudgesPerIdleEpisode: 0,
        },
        steps: [{ use: "worker_surface_setup" }],
      },
    )

    const [processBlueprint] = loadProcessBlueprintCatalog({
      processBlueprintDirs: [projectBlueprintDir],
      processStepDirs: [projectStepDir, workspaceStepDir],
    })

    expect(processBlueprint).toBeDefined()
    expect(isProceduralProcessBlueprint(processBlueprint)).toBe(true)
    if (!isProceduralProcessBlueprint(processBlueprint)) {
      throw new Error("expected a procedural process blueprint")
    }
    expect(processBlueprint.steps[0]?.id).toBe("workspace_step")
    expect(processBlueprint.steps[0]?.title).toBe("Workspace step")
  })

  test("workspace process blueprints override project process blueprints by id", () => {
    const projectRoot = createTempCatalogRoot()
    const workspaceRoot = createTempCatalogRoot()
    const projectBlueprintDir = join(projectRoot, "process-blueprints")
    const workspaceBlueprintDir = join(workspaceRoot, "process-blueprints")

    const projectProcess = {
      id: "deploy",
      title: "Project Deploy",
      expectation: "Project expectation",
      idlePrompt: "idle",
      completionMode: "exact_reply",
      completionToken: "done: deploy",
      blockedToken: "blocked: deploy",
      stopConditions: [],
      watchdog: {
        enabled: true,
        idleTimeoutSeconds: 90,
        maxNudgesPerIdleEpisode: 0,
      },
      steps: [{ id: "project_step", title: "Project step" }],
    }

    writeJson(
      join(projectBlueprintDir, "deploy.process-blueprint.json"),
      projectProcess,
    )
    writeJson(join(workspaceBlueprintDir, "deploy.process-blueprint.json"), {
      ...projectProcess,
      title: "Workspace Deploy",
      expectation: "Workspace expectation",
      steps: [{ id: "workspace_step", title: "Workspace step" }],
    })

    const [processBlueprint] = loadProcessBlueprintCatalog({
      processBlueprintDirs: [projectBlueprintDir, workspaceBlueprintDir],
      processStepDirs: [],
    })

    expect(processBlueprint).toBeDefined()
    expect(processBlueprint?.title).toBe("Workspace Deploy")
    expect(processBlueprint?.expectation).toBe("Workspace expectation")
    expect(isProceduralProcessBlueprint(processBlueprint)).toBe(true)
    if (!isProceduralProcessBlueprint(processBlueprint)) {
      throw new Error("expected a procedural process blueprint")
    }
    expect(processBlueprint.steps[0]?.id).toBe("workspace_step")
  })

  test("template-backed process blueprints resolve variables and step bundles", () => {
    const projectRoot = createTempCatalogRoot()
    const projectBlueprintDir = join(projectRoot, "process-blueprints")
    const projectTemplateDir = join(projectRoot, "process-templates")
    const projectStepDir = join(projectRoot, "process-steps")

    writeJson(join(projectStepDir, "manager-worktree.process-steps.json"), {
      id: "manager_worktree",
      title: "Manager worktree",
      steps: [
        { id: "prepare_manager_worktree", title: "Prepare manager worktree" },
      ],
    })
    writeJson(join(projectStepDir, "merge-development.process-steps.json"), {
      id: "merge_development",
      title: "Merge development",
      steps: [
        { id: "merge_into_development", title: "Merge into development" },
      ],
    })
    writeJson(join(projectTemplateDir, "define-process.process-template.json"), {
      id: "define_process_template",
      title: "Define Process",
      variables: ["targetProject", "workLocation", "mergeSteps"],
      blueprint: {
        expectation:
          "Use the configured work location for {{targetProject}} process definition work.",
        idlePrompt: "idle",
        completionMode: "exact_reply",
        completionToken: "done: process defined",
        blockedToken: "blocked: process definition requires clarification",
        stopConditions: ["process-definition work complete"],
        watchdog: {
          enabled: true,
          idleTimeoutSeconds: 90,
          maxNudgesPerIdleEpisode: 0,
        },
        steps: [{ use: "{{workLocation}}" }, { use: "{{mergeSteps}}" }],
      },
    })
    writeJson(join(projectBlueprintDir, "define-process-t.process-blueprint.json"), {
      id: "define_process_t",
      title: "Define Process (T)",
      catalogOrder: 99,
      template: "define_process_template",
      variables: {
        targetProject: "agent-infrastructure",
        workLocation: "manager_worktree",
        mergeSteps: "merge_development",
      },
    })

    const [processBlueprint] = loadProcessBlueprintCatalog({
      processBlueprintDirs: [projectBlueprintDir],
      processTemplateDirs: [projectTemplateDir],
      processStepDirs: [projectStepDir],
    })

    expect(processBlueprint).toBeDefined()
    expect(isProceduralProcessBlueprint(processBlueprint)).toBe(true)
    if (!isProceduralProcessBlueprint(processBlueprint)) {
      throw new Error("expected a procedural process blueprint")
    }
    expect(processBlueprint.expectation).toContain("agent-infrastructure")
    expect(processBlueprint.steps.map((step) => step.id)).toEqual([
      "prepare_manager_worktree",
      "merge_into_development",
    ])
  })
})
